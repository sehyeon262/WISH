package com.comong.backend.domain.gomoku.service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.gomoku.dto.GomokuChatMessageResponse;
import com.comong.backend.domain.gomoku.dto.GomokuChatMessageSendRequest;
import com.comong.backend.domain.gomoku.dto.GomokuMatchSummaryResponse;
import com.comong.backend.domain.gomoku.dto.GomokuMoveRecord;
import com.comong.backend.domain.gomoku.dto.GomokuMoveRequest;
import com.comong.backend.domain.gomoku.dto.GomokuRankingEntryResponse;
import com.comong.backend.domain.gomoku.dto.GomokuRankingResponse;
import com.comong.backend.domain.gomoku.dto.GomokuRoomCreateRequest;
import com.comong.backend.domain.gomoku.dto.GomokuRoomJoinRequest;
import com.comong.backend.domain.gomoku.dto.GomokuRoomResponse;
import com.comong.backend.domain.gomoku.dto.GomokuStatsResponse;
import com.comong.backend.domain.gomoku.dto.GomokuViewerRole;
import com.comong.backend.domain.gomoku.entity.GomokuChatMessage;
import com.comong.backend.domain.gomoku.entity.GomokuEndReason;
import com.comong.backend.domain.gomoku.entity.GomokuMatch;
import com.comong.backend.domain.gomoku.entity.GomokuMatchResult;
import com.comong.backend.domain.gomoku.entity.GomokuMatchStatus;
import com.comong.backend.domain.gomoku.entity.GomokuRuleSet;
import com.comong.backend.domain.gomoku.entity.GomokuStone;
import com.comong.backend.domain.gomoku.exception.GomokuErrorCode;
import com.comong.backend.domain.gomoku.repository.GomokuChatMessageRepository;
import com.comong.backend.domain.gomoku.repository.GomokuMatchRepository;
import com.comong.backend.domain.gomoku.repository.GomokuRankingProjection;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GomokuService {

    private static final int BOARD_SIZE = 15;
    private static final char[] ROOM_CODE_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int ROOM_CODE_LENGTH = 6;
    private static final Direction[] DIRECTIONS = {
        new Direction(0, 1), new Direction(1, 0), new Direction(1, 1), new Direction(1, -1)
    };
    private static final String[] OPEN_THREE_PATTERNS = {".XXX.", ".XX.X.", ".X.XX."};
    private static final int DIRECTIONAL_PATTERN_RADIUS = 5;
    private static final int CHAT_RECENT_LIMIT = 50;
    private static final int CHAT_MAX_CONTENT_LENGTH = 200;
    private static final int CHAT_RATE_LIMIT_PER_MINUTE = 20;
    private static final Duration CHAT_RATE_LIMIT_WINDOW = Duration.ofMinutes(1);

    private final GomokuMatchRepository gomokuMatchRepository;
    private final GomokuChatMessageRepository gomokuChatMessageRepository;
    private final PatientProfileService patientProfileService;
    private final ObjectMapper objectMapper;

    private final SecureRandom random = new SecureRandom();

    @Value("${gomoku.rooms.waiting-stale-timeout:PT2M}")
    private Duration waitingRoomStaleTimeout;

    @Value("${gomoku.rooms.playing-stale-timeout:PT90S}")
    private Duration playingRoomStaleTimeout;

    @Transactional
    public GomokuRoomResponse createRoom(Long userId, GomokuRoomCreateRequest request) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch saved =
                gomokuMatchRepository.save(
                        GomokuMatch.builder()
                                .roomCode(generateRoomCode())
                                .blackPatientProfile(patientProfile)
                                .blackTextureKey(request.textureKey())
                                .ruleSet(request.ruleSet())
                                .timerSeconds(request.timerSeconds())
                                .build());
        return toRoomResponse(saved, patientProfile.getId());
    }

    public Page<GomokuRoomResponse> findWaitingRooms(Long userId, Pageable pageable) {
        Long myPatientProfileId =
                patientProfileService
                        .findEntityByUserId(userId)
                        .map(PatientProfile::getId)
                        .orElse(null);
        return gomokuMatchRepository
                .findJoinableWaitingRooms(
                        GomokuMatchStatus.WAITING,
                        LocalDateTime.now().minus(waitingRoomStaleTimeout),
                        pageable)
                .map(match -> toRoomResponse(match, myPatientProfileId));
    }

    public Page<GomokuRoomResponse> findOpenRooms(Long userId, Pageable pageable) {
        Long myPatientProfileId =
                patientProfileService
                        .findEntityByUserId(userId)
                        .map(PatientProfile::getId)
                        .orElse(null);
        LocalDateTime now = LocalDateTime.now();
        return gomokuMatchRepository
                .findOpenRooms(
                        GomokuMatchStatus.WAITING,
                        GomokuMatchStatus.PLAYING,
                        now.minus(waitingRoomStaleTimeout),
                        now.minus(playingRoomStaleTimeout),
                        pageable)
                .map(match -> toRoomResponse(match, myPatientProfileId));
    }

    @Transactional
    public GomokuRoomResponse joinRoom(Long userId, Long roomId, GomokuRoomJoinRequest request) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        if (match.getStatus() != GomokuMatchStatus.WAITING) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
        }
        if (match.getWhitePatientProfile() != null) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_ROOM_FULL);
        }
        if (match.getBlackPatientProfile().getId().equals(patientProfile.getId())) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_SELF_PLAY_NOT_ALLOWED);
        }
        match.joinAsWhite(patientProfile, request == null ? null : request.textureKey());
        return toRoomResponse(match, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse startRoom(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        if (match.getStatus() != GomokuMatchStatus.WAITING
                || match.getWhitePatientProfile() == null) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
        }
        if (!match.getBlackPatientProfile().getId().equals(patientProfile.getId())) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_NOT_PARTICIPANT);
        }
        match.markSeen(patientProfile.getId());
        match.start();
        return toRoomResponse(match, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse swapStones(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        if (match.getStatus() != GomokuMatchStatus.WAITING
                || match.getWhitePatientProfile() == null) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
        }
        if (!match.getBlackPatientProfile().getId().equals(patientProfile.getId())) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_NOT_PARTICIPANT);
        }
        match.swapPlayersBeforeStart();
        match.markSeen(patientProfile.getId());
        return toRoomResponse(match, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse rematchRoom(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        if (match.getStatus() != GomokuMatchStatus.FINISHED
                || match.getWhitePatientProfile() == null) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
        }
        ensureParticipant(match, patientProfile.getId());

        GomokuMatch rematch =
                gomokuMatchRepository
                        .findByRematchSourceMatchId(match.getId())
                        .orElseGet(() -> createSwappedRematch(match));
        return toRoomResponse(rematch, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse findRoom(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        ensureCanView(match, patientProfile.getId());
        List<GomokuMoveRecord> moves = parseMoves(match.getMovesJson());
        finishIfTimedOut(match, moves);
        return GomokuRoomResponse.of(match, moves, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse heartbeat(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        ensureParticipant(match, patientProfile.getId());

        List<GomokuMoveRecord> moves = parseMoves(match.getMovesJson());
        if (match.getStatus() == GomokuMatchStatus.PLAYING) {
            finishIfTimedOut(match, moves);
        }
        if (match.getStatus() == GomokuMatchStatus.WAITING
                || match.getStatus() == GomokuMatchStatus.PLAYING) {
            match.markSeen(patientProfile.getId());
        }
        return GomokuRoomResponse.of(match, moves, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse playMove(Long userId, Long roomId, GomokuMoveRequest request) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        ensurePlaying(match);
        GomokuStone myStone = ensureParticipant(match, patientProfile.getId());
        match.markSeen(patientProfile.getId());

        List<GomokuMoveRecord> moves = parseMoves(match.getMovesJson());
        if (finishIfTimedOut(match, moves)) {
            return GomokuRoomResponse.of(match, moves, patientProfile.getId());
        }
        if (match.getCurrentTurn() != myStone) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_NOT_YOUR_TURN);
        }

        GomokuStone[][] board = buildBoard(moves);
        if (!isInside(request.row(), request.col())
                || board[request.row()][request.col()] != null) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_MOVE);
        }
        if (isForbidden(board, request.row(), request.col(), myStone, match.getRuleSet())) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_MOVE);
        }

        moves.add(new GomokuMoveRecord(request.row(), request.col(), myStone, LocalDateTime.now()));
        board[request.row()][request.col()] = myStone;
        String movesJson = writeMoves(moves);

        List<Position> winningLine =
                getWinningLine(board, request.row(), request.col(), myStone, match.getRuleSet());
        if (winningLine != null) {
            GomokuMatchResult result =
                    myStone == GomokuStone.BLACK
                            ? GomokuMatchResult.BLACK_WIN
                            : GomokuMatchResult.WHITE_WIN;
            match.finish(movesJson, moves.size(), result, GomokuEndReason.FIVE, patientProfile);
            return toRoomResponse(match, patientProfile.getId());
        }

        if (moves.size() == BOARD_SIZE * BOARD_SIZE) {
            match.finish(
                    movesJson,
                    moves.size(),
                    GomokuMatchResult.DRAW,
                    GomokuEndReason.BOARD_FULL,
                    null);
            return toRoomResponse(match, patientProfile.getId());
        }

        match.applyMove(movesJson, myStone.opponent(), moves.size());
        return toRoomResponse(match, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse resign(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        ensurePlaying(match);
        GomokuStone myStone = ensureParticipant(match, patientProfile.getId());
        match.markSeen(patientProfile.getId());

        List<GomokuMoveRecord> moves = parseMoves(match.getMovesJson());
        if (finishIfTimedOut(match, moves)) {
            return GomokuRoomResponse.of(match, moves, patientProfile.getId());
        }

        finishByForfeit(match, myStone, GomokuEndReason.RESIGN);
        return toRoomResponse(match, patientProfile.getId());
    }

    @Transactional
    public GomokuRoomResponse leave(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        GomokuStone myStone = ensureParticipant(match, patientProfile.getId());
        match.markSeen(patientProfile.getId());
        if (match.getStatus() == GomokuMatchStatus.WAITING) {
            if (myStone == GomokuStone.BLACK) {
                match.cancel(GomokuEndReason.LEAVE);
            } else {
                match.removeWhiteBeforeStart();
            }
            return toRoomResponse(match, patientProfile.getId());
        }
        if (match.getStatus() == GomokuMatchStatus.PLAYING) {
            List<GomokuMoveRecord> moves = parseMoves(match.getMovesJson());
            if (finishIfTimedOut(match, moves)) {
                return GomokuRoomResponse.of(match, moves, patientProfile.getId());
            }
            finishByForfeit(match, myStone, GomokuEndReason.LEAVE);
            return toRoomResponse(match, patientProfile.getId());
        }
        return toRoomResponse(match, patientProfile.getId());
    }

    @Transactional
    public GomokuChatMessageResponse sendChatMessage(
            Long userId, Long roomId, GomokuChatMessageSendRequest request) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match = findRoomForUpdateOrThrow(roomId);
        GomokuViewerRole senderRole = ensureCanChat(match, patientProfile.getId());

        String content = request.content() == null ? "" : request.content().trim();
        if (content.isBlank()) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_MESSAGE_BLANK);
        }
        if (content.length() > CHAT_MAX_CONTENT_LENGTH) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_MESSAGE_TOO_LONG);
        }

        LocalDateTime windowStart = LocalDateTime.now().minus(CHAT_RATE_LIMIT_WINDOW);
        long recentCount =
                gomokuChatMessageRepository
                        .countByMatchIdAndSenderPatientProfileIdAndCreatedAtAfter(
                                match.getId(), patientProfile.getId(), windowStart);
        if (recentCount >= CHAT_RATE_LIMIT_PER_MINUTE) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_MESSAGE_RATE_LIMITED);
        }

        if (senderRole == GomokuViewerRole.PLAYER) {
            match.markSeen(patientProfile.getId());
        }
        GomokuChatMessage saved =
                gomokuChatMessageRepository.save(
                        GomokuChatMessage.builder()
                                .match(match)
                                .senderPatientProfile(patientProfile)
                                .content(content)
                                .build());
        return GomokuChatMessageResponse.from(saved, senderRole);
    }

    public List<GomokuChatMessageResponse> findRecentChatMessages(Long userId, Long roomId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        GomokuMatch match =
                gomokuMatchRepository
                        .findById(roomId)
                        .orElseThrow(
                                () -> new BusinessException(GomokuErrorCode.GOMOKU_ROOM_NOT_FOUND));
        ensureCanView(match, patientProfile.getId());
        List<GomokuChatMessageResponse> messages =
                gomokuChatMessageRepository
                        .findRecentByMatchId(match.getId(), PageRequest.of(0, CHAT_RECENT_LIMIT))
                        .stream()
                        .map(
                                message ->
                                        GomokuChatMessageResponse.from(
                                                message, roleOfSender(match, message)))
                        .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        messages.sort((a, b) -> Long.compare(a.id(), b.id()));
        return messages;
    }

    public Page<GomokuMatchSummaryResponse> findMine(Long userId, Pageable pageable) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        return gomokuMatchRepository
                .findPageByParticipantUserId(userId, pageable)
                .map(match -> GomokuMatchSummaryResponse.of(match, patientProfile.getId()));
    }

    public GomokuStatsResponse findMyStats(Long userId) {
        PatientProfile patientProfile = findPatientProfileOrThrow(userId);
        long totalGames = gomokuMatchRepository.countRankedGames(patientProfile.getId());
        long wins = gomokuMatchRepository.countRankedWins(patientProfile.getId());
        long draws = gomokuMatchRepository.countRankedDraws(patientProfile.getId());
        return GomokuStatsResponse.of(totalGames, wins, draws);
    }

    public GomokuRankingResponse findRanking(Long userId, int limit, int minGames) {
        Long myPatientProfileId =
                patientProfileService
                        .findEntityByUserId(userId)
                        .map(PatientProfile::getId)
                        .orElse(null);
        int safeLimit = Math.max(1, Math.min(limit, 100));
        int safeMinGames = Math.max(1, Math.min(minGames, 100));
        List<GomokuRankingProjection> projections =
                gomokuMatchRepository.findRanking(safeMinGames, Math.max(safeLimit, 100));
        List<GomokuRankingEntryResponse> allEntries =
                java.util.stream.IntStream.range(0, projections.size())
                        .mapToObj(
                                index ->
                                        GomokuRankingEntryResponse.of(
                                                projections.get(index),
                                                index + 1,
                                                myPatientProfileId))
                        .toList();
        List<GomokuRankingEntryResponse> topEntries = allEntries.stream().limit(safeLimit).toList();
        GomokuRankingEntryResponse me =
                allEntries.stream()
                        .filter(GomokuRankingEntryResponse::isMe)
                        .findFirst()
                        .orElse(null);
        long totalPlayers = gomokuMatchRepository.countRankedPlayers(safeMinGames);
        return new GomokuRankingResponse((int) totalPlayers, safeMinGames, topEntries, me);
    }

    @Transactional
    public int cleanupStaleRooms() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime waitingStaleBefore = now.minus(waitingRoomStaleTimeout);
        LocalDateTime playingStaleBefore = now.minus(playingRoomStaleTimeout);
        List<GomokuMatch> staleRooms =
                gomokuMatchRepository.findStaleActiveRoomsForUpdate(
                        GomokuMatchStatus.WAITING,
                        GomokuMatchStatus.PLAYING,
                        waitingStaleBefore,
                        playingStaleBefore);

        int cleaned = 0;
        for (GomokuMatch match : staleRooms) {
            if (cleanupStaleRoom(match, waitingStaleBefore, playingStaleBefore)) {
                cleaned += 1;
            }
        }
        return cleaned;
    }

    private boolean cleanupStaleRoom(
            GomokuMatch match, LocalDateTime waitingStaleBefore, LocalDateTime playingStaleBefore) {
        if (match.getStatus() == GomokuMatchStatus.WAITING) {
            boolean blackStale = isStale(match.getBlackLastSeenAt(), waitingStaleBefore);
            boolean whiteStale =
                    match.getWhitePatientProfile() != null
                            && isStale(match.getWhiteLastSeenAt(), waitingStaleBefore);

            if (blackStale) {
                match.cancel(GomokuEndReason.LEAVE);
                return true;
            }
            if (whiteStale) {
                match.removeWhiteBeforeStart();
                return true;
            }
            return false;
        }

        if (match.getStatus() == GomokuMatchStatus.PLAYING) {
            boolean blackStale = isStale(match.getBlackLastSeenAt(), playingStaleBefore);
            boolean whiteStale = isStale(match.getWhiteLastSeenAt(), playingStaleBefore);

            if (blackStale && whiteStale) {
                match.cancel(GomokuEndReason.LEAVE);
                return true;
            }
            if (blackStale) {
                finishByForfeit(match, GomokuStone.BLACK, GomokuEndReason.LEAVE);
                return true;
            }
            if (whiteStale) {
                finishByForfeit(match, GomokuStone.WHITE, GomokuEndReason.LEAVE);
                return true;
            }
        }
        return false;
    }

    private boolean isStale(LocalDateTime lastSeenAt, LocalDateTime staleBefore) {
        return lastSeenAt == null || lastSeenAt.isBefore(staleBefore);
    }

    private PatientProfile findPatientProfileOrThrow(Long userId) {
        return patientProfileService
                .findEntityByUserId(userId)
                .orElseThrow(
                        () -> new BusinessException(PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));
    }

    private GomokuMatch findRoomForUpdateOrThrow(Long roomId) {
        return gomokuMatchRepository
                .findByIdForUpdate(roomId)
                .orElseThrow(() -> new BusinessException(GomokuErrorCode.GOMOKU_ROOM_NOT_FOUND));
    }

    private void ensurePlaying(GomokuMatch match) {
        if (match.getStatus() != GomokuMatchStatus.PLAYING
                || match.getWhitePatientProfile() == null) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
        }
    }

    private GomokuStone ensureParticipant(GomokuMatch match, Long patientProfileId) {
        GomokuStone stone = match.stoneOf(patientProfileId);
        if (stone == null) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_NOT_PARTICIPANT);
        }
        return stone;
    }

    private GomokuViewerRole ensureCanView(GomokuMatch match, Long patientProfileId) {
        if (match.stoneOf(patientProfileId) != null) {
            return GomokuViewerRole.PLAYER;
        }
        GomokuMatchStatus status = match.getStatus();
        if (status == GomokuMatchStatus.PLAYING || status == GomokuMatchStatus.FINISHED) {
            return GomokuViewerRole.SPECTATOR;
        }
        throw new BusinessException(GomokuErrorCode.GOMOKU_NOT_PARTICIPANT);
    }

    private GomokuViewerRole ensureCanChat(GomokuMatch match, Long patientProfileId) {
        GomokuMatchStatus status = match.getStatus();
        if (status == GomokuMatchStatus.CANCELLED) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_MESSAGE_NOT_ALLOWED);
        }
        if (match.stoneOf(patientProfileId) != null) {
            return GomokuViewerRole.PLAYER;
        }
        if (status == GomokuMatchStatus.PLAYING || status == GomokuMatchStatus.FINISHED) {
            return GomokuViewerRole.SPECTATOR;
        }
        throw new BusinessException(GomokuErrorCode.GOMOKU_NOT_PARTICIPANT);
    }

    private GomokuViewerRole roleOfSender(GomokuMatch match, GomokuChatMessage message) {
        Long senderId = message.getSenderPatientProfile().getId();
        return match.stoneOf(senderId) != null
                ? GomokuViewerRole.PLAYER
                : GomokuViewerRole.SPECTATOR;
    }

    private GomokuRoomResponse toRoomResponse(GomokuMatch match, Long myPatientProfileId) {
        return GomokuRoomResponse.of(match, parseMoves(match.getMovesJson()), myPatientProfileId);
    }

    private GomokuMatch createSwappedRematch(GomokuMatch match) {
        return gomokuMatchRepository.save(
                GomokuMatch.builder()
                        .roomCode(generateRoomCode())
                        .blackPatientProfile(match.getWhitePatientProfile())
                        .blackTextureKey(match.getWhiteTextureKey())
                        .whitePatientProfile(match.getBlackPatientProfile())
                        .whiteTextureKey(match.getBlackTextureKey())
                        .ruleSet(match.getRuleSet())
                        .timerSeconds(match.getTimerSeconds())
                        .rematchSourceMatch(match)
                        .build());
    }

    private void finishByForfeit(
            GomokuMatch match, GomokuStone loserStone, GomokuEndReason endReason) {
        GomokuStone winnerStone = loserStone.opponent();
        PatientProfile winner = match.patientForStone(winnerStone);
        match.finish(
                match.getMovesJson(),
                match.getMoveCount(),
                resultFor(winnerStone),
                endReason,
                winner);
    }

    private boolean finishIfTimedOut(GomokuMatch match, List<GomokuMoveRecord> moves) {
        GomokuStone timedOutStone = findTimedOutStone(match, moves);
        if (timedOutStone == null) {
            return false;
        }
        finishByForfeit(match, timedOutStone, GomokuEndReason.TIMEOUT);
        return true;
    }

    private GomokuStone findTimedOutStone(GomokuMatch match, List<GomokuMoveRecord> moves) {
        if (match.getStatus() != GomokuMatchStatus.PLAYING || match.getStartedAt() == null) {
            return null;
        }

        LocalDateTime turnStartedAt = match.getStartedAt();
        for (GomokuMoveRecord move : moves) {
            if (move.playedAt() == null) {
                continue;
            }
            turnStartedAt = move.playedAt();
        }

        long currentTurnElapsedSeconds = secondsBetween(turnStartedAt, LocalDateTime.now());
        if (currentTurnElapsedSeconds >= match.getTimerSeconds()) {
            return match.getCurrentTurn();
        }
        return null;
    }

    private long secondsBetween(LocalDateTime start, LocalDateTime end) {
        return Math.max(0, Duration.between(start, end).getSeconds());
    }

    private GomokuMatchResult resultFor(GomokuStone winnerStone) {
        return winnerStone == GomokuStone.BLACK
                ? GomokuMatchResult.BLACK_WIN
                : GomokuMatchResult.WHITE_WIN;
    }

    private String generateRoomCode() {
        for (int attempt = 0; attempt < 20; attempt += 1) {
            StringBuilder builder = new StringBuilder(ROOM_CODE_LENGTH);
            for (int index = 0; index < ROOM_CODE_LENGTH; index += 1) {
                builder.append(ROOM_CODE_ALPHABET[random.nextInt(ROOM_CODE_ALPHABET.length)]);
            }
            String code = builder.toString().toUpperCase(Locale.ROOT);
            if (!gomokuMatchRepository.existsByRoomCode(code)) {
                return code;
            }
        }
        throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
    }

    private List<GomokuMoveRecord> parseMoves(String movesJson) {
        try {
            GomokuMoveRecord[] moves = objectMapper.readValue(movesJson, GomokuMoveRecord[].class);
            return new ArrayList<>(List.of(moves));
        } catch (JacksonException e) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
        }
    }

    private String writeMoves(List<GomokuMoveRecord> moves) {
        try {
            return objectMapper.writeValueAsString(moves);
        } catch (JacksonException e) {
            throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
        }
    }

    private GomokuStone[][] buildBoard(List<GomokuMoveRecord> moves) {
        GomokuStone[][] board = new GomokuStone[BOARD_SIZE][BOARD_SIZE];
        for (GomokuMoveRecord move : moves) {
            if (!isInside(move.row(), move.col()) || board[move.row()][move.col()] != null) {
                throw new BusinessException(GomokuErrorCode.GOMOKU_INVALID_ROOM_STATE);
            }
            board[move.row()][move.col()] = move.stone();
        }
        return board;
    }

    private boolean isForbidden(
            GomokuStone[][] board, int row, int col, GomokuStone stone, GomokuRuleSet ruleSet) {
        if (ruleSet != GomokuRuleSet.RENJU_LITE || stone != GomokuStone.BLACK) {
            return false;
        }
        board[row][col] = stone;
        try {
            int maxLine = 0;
            boolean exactFive = false;
            int openThrees = 0;
            int fours = 0;
            for (Direction direction : DIRECTIONS) {
                int length = countLine(board, row, col, stone, direction);
                maxLine = Math.max(maxLine, length);
                if (length == 5) {
                    exactFive = true;
                }
                if (hasOpenThree(board, row, col, stone, direction)) {
                    openThrees += 1;
                }
                if (hasFourThreat(board, row, col, stone, direction)) {
                    fours += 1;
                }
            }
            if (maxLine > 5) {
                return true;
            }
            if (exactFive) {
                return false;
            }
            return openThrees >= 2 || fours >= 2;
        } finally {
            board[row][col] = null;
        }
    }

    private List<Position> getWinningLine(
            GomokuStone[][] board, int row, int col, GomokuStone stone, GomokuRuleSet ruleSet) {
        for (Direction direction : DIRECTIONS) {
            List<Position> line = collectLine(board, row, col, stone, direction);
            boolean blackMustBeExactFive =
                    ruleSet == GomokuRuleSet.RENJU_LITE && stone == GomokuStone.BLACK;
            if (blackMustBeExactFive ? line.size() == 5 : line.size() >= 5) {
                return line.subList(0, 5);
            }
        }
        return null;
    }

    private int countLine(
            GomokuStone[][] board, int row, int col, GomokuStone stone, Direction direction) {
        return collectLine(board, row, col, stone, direction).size();
    }

    private List<Position> collectLine(
            GomokuStone[][] board, int row, int col, GomokuStone stone, Direction direction) {
        List<Position> line = new ArrayList<>();
        List<Position> backward =
                collectDirection(board, row, col, stone, -direction.dRow(), -direction.dCol());
        for (int index = backward.size() - 1; index >= 0; index -= 1) {
            line.add(backward.get(index));
        }
        line.add(new Position(row, col));
        line.addAll(collectDirection(board, row, col, stone, direction.dRow(), direction.dCol()));
        return line;
    }

    private List<Position> collectDirection(
            GomokuStone[][] board, int row, int col, GomokuStone stone, int dRow, int dCol) {
        List<Position> positions = new ArrayList<>();
        int nextRow = row + dRow;
        int nextCol = col + dCol;
        while (isInside(nextRow, nextCol) && board[nextRow][nextCol] == stone) {
            positions.add(new Position(nextRow, nextCol));
            nextRow += dRow;
            nextCol += dCol;
        }
        return positions;
    }

    private boolean hasOpenThree(
            GomokuStone[][] board, int row, int col, GomokuStone stone, Direction direction) {
        if (hasFourThreat(board, row, col, stone, direction)) {
            return false;
        }

        String line = getDirectionalPattern(board, row, col, stone, direction);
        int centerIndex = DIRECTIONAL_PATTERN_RADIUS;
        for (String pattern : OPEN_THREE_PATTERNS) {
            if (containsPatternAtOrigin(line, centerIndex, pattern)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasFourThreat(
            GomokuStone[][] board, int row, int col, GomokuStone stone, Direction direction) {
        for (int offset = -4; offset <= 4; offset += 1) {
            if (offset == 0) {
                continue;
            }

            int targetRow = row + direction.dRow() * offset;
            int targetCol = col + direction.dCol() * offset;
            if (!isInside(targetRow, targetCol) || board[targetRow][targetCol] != null) {
                continue;
            }

            board[targetRow][targetCol] = stone;
            try {
                if (countLine(board, targetRow, targetCol, stone, direction) == 5) {
                    return true;
                }
            } finally {
                board[targetRow][targetCol] = null;
            }
        }
        return false;
    }

    private String getDirectionalPattern(
            GomokuStone[][] board, int row, int col, GomokuStone stone, Direction direction) {
        StringBuilder pattern = new StringBuilder(DIRECTIONAL_PATTERN_RADIUS * 2 + 1);
        for (int offset = -DIRECTIONAL_PATTERN_RADIUS;
                offset <= DIRECTIONAL_PATTERN_RADIUS;
                offset += 1) {
            int targetRow = row + direction.dRow() * offset;
            int targetCol = col + direction.dCol() * offset;
            if (!isInside(targetRow, targetCol)) {
                pattern.append('#');
            } else if (board[targetRow][targetCol] == null) {
                pattern.append('.');
            } else {
                pattern.append(board[targetRow][targetCol] == stone ? 'X' : '#');
            }
        }
        return pattern.toString();
    }

    private boolean containsPatternAtOrigin(String line, int centerIndex, String pattern) {
        for (int start = 0; start <= line.length() - pattern.length(); start += 1) {
            int end = start + pattern.length();
            if (centerIndex < start || centerIndex >= end) {
                continue;
            }
            if (line.substring(start, end).equals(pattern)) {
                return true;
            }
        }
        return false;
    }

    private boolean isInside(int row, int col) {
        return row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE;
    }

    private record Direction(int dRow, int dCol) {}

    private record Position(int row, int col) {}
}
