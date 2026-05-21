package com.comong.backend.domain.gomoku.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.gomoku.dto.GomokuMoveRecord;
import com.comong.backend.domain.gomoku.entity.GomokuMatch;
import com.comong.backend.domain.gomoku.entity.GomokuMatchStatus;
import com.comong.backend.domain.gomoku.entity.GomokuStone;
import com.comong.backend.domain.gomoku.repository.GomokuMatchRepository;
import com.comong.backend.domain.gomoku.service.GomokuService;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class GomokuControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private GomokuMatchRepository gomokuMatchRepository;
    @Autowired private GomokuService gomokuService;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;

    @BeforeEach
    void cleanDb() {
        cleanAll();
    }

    @AfterEach
    void cleanDbAfter() {
        cleanAll();
    }

    private void cleanAll() {
        jdbc.execute("DELETE FROM gomoku_chat_messages");
        gomokuMatchRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void onlineMatchWin_isRecordedInStatsAndRanking() throws Exception {
        TestUser black = setupUserWithProfile("gomoku-black@example.com", "gomoku-black", "black");
        TestUser white = setupUserWithProfile("gomoku-white@example.com", "gomoku-white", "white");

        long roomId =
                objectMapper
                        .readTree(
                                mockMvc.perform(
                                                post("/gomoku/rooms")
                                                        .header(
                                                                "Authorization",
                                                                "Bearer " + black.token())
                                                        .contentType(MediaType.APPLICATION_JSON)
                                                        .content(createRoomRequest()))
                                        .andExpect(status().isCreated())
                                        .andExpect(jsonPath("$.data.status").value("WAITING"))
                                        .andExpect(jsonPath("$.data.myStone").value("BLACK"))
                                        .andReturn()
                                        .getResponse()
                                        .getContentAsString())
                        .get("data")
                        .get("id")
                        .asLong();

        mockMvc.perform(
                        get("/gomoku/rooms/waiting")
                                .header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value(roomId));

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/join", roomId)
                                .header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING"))
                .andExpect(jsonPath("$.data.myStone").value("WHITE"));

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/start", roomId)
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PLAYING"))
                .andExpect(jsonPath("$.data.currentTurn").value("BLACK"));

        play(black.token(), roomId, 7, 7).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(white.token(), roomId, 0, 0).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(black.token(), roomId, 7, 8).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(white.token(), roomId, 0, 1).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(black.token(), roomId, 7, 9).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(white.token(), roomId, 0, 2).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(black.token(), roomId, 7, 10).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(white.token(), roomId, 0, 3).andExpect(jsonPath("$.data.status").value("PLAYING"));
        play(black.token(), roomId, 7, 11)
                .andExpect(jsonPath("$.data.status").value("FINISHED"))
                .andExpect(jsonPath("$.data.result").value("BLACK_WIN"))
                .andExpect(jsonPath("$.data.endReason").value("FIVE"))
                .andExpect(jsonPath("$.data.ranked").value(true))
                .andExpect(jsonPath("$.data.moveCount").value(9));

        mockMvc.perform(get("/gomoku/stats/me").header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalGames").value(1))
                .andExpect(jsonPath("$.data.wins").value(1))
                .andExpect(jsonPath("$.data.losses").value(0))
                .andExpect(jsonPath("$.data.winRate").value(1.0));

        mockMvc.perform(get("/gomoku/stats/me").header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalGames").value(1))
                .andExpect(jsonPath("$.data.wins").value(0))
                .andExpect(jsonPath("$.data.losses").value(1))
                .andExpect(jsonPath("$.data.winRate").value(0.0));

        mockMvc.perform(
                        get("/gomoku/ranking")
                                .param("limit", "10")
                                .param("minGames", "1")
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalPlayers").value(2))
                .andExpect(jsonPath("$.data.entries[0].nickname").value("black"))
                .andExpect(jsonPath("$.data.entries[0].wins").value(1))
                .andExpect(jsonPath("$.data.entries[0].isMe").value(true));
    }

    @Test
    void waitingRooms_excludesStaleHostRooms() throws Exception {
        TestUser host =
                setupUserWithProfile(
                        "gomoku-stale-host@example.com", "gomoku-stale-host", "stale-host");
        TestUser viewer =
                setupUserWithProfile(
                        "gomoku-stale-viewer@example.com", "gomoku-stale-viewer", "stale-viewer");
        long roomId = createWaitingRoom(host, "RENJU_LITE");

        expireGomokuParticipant(roomId, "black_last_seen_at", LocalDateTime.now().minusMinutes(5));

        mockMvc.perform(
                        get("/gomoku/rooms/waiting")
                                .header("Authorization", "Bearer " + viewer.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    @Test
    void heartbeatKeepsWaitingRoomVisible() throws Exception {
        TestUser host =
                setupUserWithProfile(
                        "gomoku-heartbeat-host@example.com",
                        "gomoku-heartbeat-host",
                        "heartbeat-host");
        TestUser viewer =
                setupUserWithProfile(
                        "gomoku-heartbeat-viewer@example.com",
                        "gomoku-heartbeat-viewer",
                        "heartbeat-viewer");
        long roomId = createWaitingRoom(host, "RENJU_LITE");

        expireGomokuParticipant(roomId, "black_last_seen_at", LocalDateTime.now().minusMinutes(5));

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/heartbeat", roomId)
                                .header("Authorization", "Bearer " + host.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(roomId))
                .andExpect(jsonPath("$.data.status").value("WAITING"));

        mockMvc.perform(
                        get("/gomoku/rooms/waiting")
                                .header("Authorization", "Bearer " + viewer.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value(roomId));
    }

    @Test
    void cleanupStaleRooms_cancelsStaleWaitingRoom() throws Exception {
        TestUser host =
                setupUserWithProfile(
                        "gomoku-cleanup-host@example.com", "gomoku-cleanup-host", "cleanup-host");
        long roomId = createWaitingRoom(host, "RENJU_LITE");

        expireGomokuParticipant(roomId, "black_last_seen_at", LocalDateTime.now().minusMinutes(5));

        assertThat(gomokuService.cleanupStaleRooms()).isEqualTo(1);

        GomokuMatch match = gomokuMatchRepository.findById(roomId).orElseThrow();
        assertThat(match.getStatus()).isEqualTo(GomokuMatchStatus.CANCELLED);
    }

    @Test
    void roomResponses_includePlayerTextureKeys() throws Exception {
        TestUser black =
                setupUserWithProfile("gomoku-texture-black@example.com", "texture-black", "black");
        TestUser white =
                setupUserWithProfile("gomoku-texture-white@example.com", "texture-white", "white");

        long roomId =
                objectMapper
                        .readTree(
                                mockMvc.perform(
                                                post("/gomoku/rooms")
                                                        .header(
                                                                "Authorization",
                                                                "Bearer " + black.token())
                                                        .contentType(MediaType.APPLICATION_JSON)
                                                        .content(
                                                                createRoomRequest(
                                                                        "FREESTYLE",
                                                                        "character-outfit-man3")))
                                        .andExpect(status().isCreated())
                                        .andExpect(
                                                jsonPath("$.data.blackPlayer.textureKey")
                                                        .value("character-outfit-man3"))
                                        .andReturn()
                                        .getResponse()
                                        .getContentAsString())
                        .get("data")
                        .get("id")
                        .asLong();

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/join", roomId)
                                .header("Authorization", "Bearer " + white.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(joinRoomRequest("character-outfit-girl4")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING"))
                .andExpect(jsonPath("$.data.blackPlayer.textureKey").value("character-outfit-man3"))
                .andExpect(
                        jsonPath("$.data.whitePlayer.textureKey").value("character-outfit-girl4"));

        mockMvc.perform(
                        get("/gomoku/rooms/{roomId}", roomId)
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.blackPlayer.textureKey").value("character-outfit-man3"))
                .andExpect(
                        jsonPath("$.data.whitePlayer.textureKey").value("character-outfit-girl4"));
    }

    @Test
    void swapStones_beforeStartSwapsPlayersAndNewBlackCanStart() throws Exception {
        TestUser black =
                setupUserWithProfile("gomoku-swap-black@example.com", "swap-black", "black");
        TestUser white =
                setupUserWithProfile("gomoku-swap-white@example.com", "swap-white", "white");

        long roomId = createWaitingJoinedRoom(black, white, "FREESTYLE");

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/swap-stones", roomId)
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING"))
                .andExpect(
                        jsonPath("$.data.blackPlayer.patientProfileId")
                                .value(white.patientProfileId()))
                .andExpect(
                        jsonPath("$.data.whitePlayer.patientProfileId")
                                .value(black.patientProfileId()))
                .andExpect(jsonPath("$.data.myStone").value("WHITE"));

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/start", roomId)
                                .header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PLAYING"))
                .andExpect(jsonPath("$.data.currentTurn").value("BLACK"))
                .andExpect(jsonPath("$.data.myStone").value("BLACK"));
    }

    @Test
    void rematchRoom_afterFinishCreatesWaitingRoomWithSwappedPlayers() throws Exception {
        TestUser black =
                setupUserWithProfile("gomoku-rematch-black@example.com", "rematch-black", "black");
        TestUser white =
                setupUserWithProfile("gomoku-rematch-white@example.com", "rematch-white", "white");

        long roomId = createJoinedRoom(black, white, "FREESTYLE");
        play(black.token(), roomId, 7, 7);
        play(white.token(), roomId, 0, 0);
        play(black.token(), roomId, 7, 8);
        play(white.token(), roomId, 0, 1);
        play(black.token(), roomId, 7, 9);
        play(white.token(), roomId, 0, 2);
        play(black.token(), roomId, 7, 10);
        play(white.token(), roomId, 0, 3);
        play(black.token(), roomId, 7, 11).andExpect(jsonPath("$.data.status").value("FINISHED"));

        String rematchBody =
                mockMvc.perform(
                                post("/gomoku/rooms/{roomId}/rematch", roomId)
                                        .header("Authorization", "Bearer " + black.token()))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.data.status").value("WAITING"))
                        .andExpect(
                                jsonPath("$.data.blackPlayer.patientProfileId")
                                        .value(white.patientProfileId()))
                        .andExpect(
                                jsonPath("$.data.whitePlayer.patientProfileId")
                                        .value(black.patientProfileId()))
                        .andExpect(jsonPath("$.data.currentTurn").value("BLACK"))
                        .andExpect(jsonPath("$.data.myStone").value("WHITE"))
                        .andExpect(jsonPath("$.data.moveCount").value(0))
                        .andExpect(jsonPath("$.data.ranked").value(false))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        long rematchId = objectMapper.readTree(rematchBody).get("data").get("id").asLong();

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/start", rematchId)
                                .header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PLAYING"))
                .andExpect(jsonPath("$.data.myStone").value("BLACK"));
    }

    @Test
    void joinRoom_rejectsSelfPlay() throws Exception {
        TestUser user = setupUserWithProfile("gomoku-self@example.com", "gomoku-self", "self");
        long roomId =
                objectMapper
                        .readTree(
                                mockMvc.perform(
                                                post("/gomoku/rooms")
                                                        .header(
                                                                "Authorization",
                                                                "Bearer " + user.token())
                                                        .contentType(MediaType.APPLICATION_JSON)
                                                        .content(createRoomRequest()))
                                        .andExpect(status().isCreated())
                                        .andReturn()
                                        .getResponse()
                                        .getContentAsString())
                        .get("data")
                        .get("id")
                        .asLong();

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/join", roomId)
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GM-007"));
    }

    @Test
    void ranking_ordersByWinsThenWinRate() throws Exception {
        TestUser alpha =
                setupUserWithProfile("gomoku-rank-alpha@example.com", "rank-alpha", "alpha");
        TestUser beta = setupUserWithProfile("gomoku-rank-beta@example.com", "rank-beta", "beta");
        TestUser gamma =
                setupUserWithProfile("gomoku-rank-gamma@example.com", "rank-gamma", "gamma");

        finishBlackWin(alpha, gamma);
        finishBlackWin(alpha, gamma);
        finishBlackWin(gamma, alpha);
        finishBlackWin(beta, gamma);
        finishBlackWin(beta, gamma);

        mockMvc.perform(
                        get("/gomoku/ranking")
                                .param("limit", "10")
                                .param("minGames", "1")
                                .header("Authorization", "Bearer " + alpha.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalPlayers").value(3))
                .andExpect(jsonPath("$.data.entries[0].nickname").value("beta"))
                .andExpect(jsonPath("$.data.entries[0].wins").value(2))
                .andExpect(jsonPath("$.data.entries[0].winRate").value(1.0))
                .andExpect(jsonPath("$.data.entries[1].nickname").value("alpha"))
                .andExpect(jsonPath("$.data.entries[1].wins").value(2))
                .andExpect(jsonPath("$.data.entries[2].nickname").value("gamma"))
                .andExpect(jsonPath("$.data.entries[2].wins").value(1));
    }

    @Test
    void renjuLite_rejectsBrokenDoubleThreeMove() throws Exception {
        TestUser black =
                setupUserWithProfile(
                        "gomoku-renju-black@example.com", "gomoku-renju-black", "renju-black");
        TestUser white =
                setupUserWithProfile(
                        "gomoku-renju-white@example.com", "gomoku-renju-white", "renju-white");

        long roomId =
                objectMapper
                        .readTree(
                                mockMvc.perform(
                                                post("/gomoku/rooms")
                                                        .header(
                                                                "Authorization",
                                                                "Bearer " + black.token())
                                                        .contentType(MediaType.APPLICATION_JSON)
                                                        .content(createRoomRequest("RENJU_LITE")))
                                        .andExpect(status().isCreated())
                                        .andReturn()
                                        .getResponse()
                                        .getContentAsString())
                        .get("data")
                        .get("id")
                        .asLong();

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/join", roomId)
                                .header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING"));

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/start", roomId)
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PLAYING"));

        play(black.token(), roomId, 7, 6);
        play(white.token(), roomId, 0, 0);
        play(black.token(), roomId, 7, 9);
        play(white.token(), roomId, 0, 1);
        play(black.token(), roomId, 6, 7);
        play(white.token(), roomId, 0, 2);
        play(black.token(), roomId, 9, 7);
        play(white.token(), roomId, 0, 3);

        attemptPlay(black.token(), roomId, 7, 7)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GM-005"));
    }

    @Test
    void renjuLite_allowsBlackFourThreeMove() throws Exception {
        TestUser black =
                setupUserWithProfile(
                        "gomoku-four-three-black@example.com",
                        "gomoku-four-three-black",
                        "four-three-black");
        TestUser white =
                setupUserWithProfile(
                        "gomoku-four-three-white@example.com",
                        "gomoku-four-three-white",
                        "four-three-white");

        long roomId =
                objectMapper
                        .readTree(
                                mockMvc.perform(
                                                post("/gomoku/rooms")
                                                        .header(
                                                                "Authorization",
                                                                "Bearer " + black.token())
                                                        .contentType(MediaType.APPLICATION_JSON)
                                                        .content(createRoomRequest("RENJU_LITE")))
                                        .andExpect(status().isCreated())
                                        .andReturn()
                                        .getResponse()
                                        .getContentAsString())
                        .get("data")
                        .get("id")
                        .asLong();

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/join", roomId)
                                .header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING"));

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/start", roomId)
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PLAYING"));

        play(black.token(), roomId, 7, 5);
        play(white.token(), roomId, 0, 0);
        play(black.token(), roomId, 7, 6);
        play(white.token(), roomId, 0, 2);
        play(black.token(), roomId, 7, 8);
        play(white.token(), roomId, 0, 4);
        play(black.token(), roomId, 6, 7);
        play(white.token(), roomId, 1, 0);
        play(black.token(), roomId, 8, 7);
        play(white.token(), roomId, 1, 2);

        play(black.token(), roomId, 7, 7)
                .andExpect(jsonPath("$.data.status").value("PLAYING"))
                .andExpect(jsonPath("$.data.moveCount").value(11));
    }

    @Test
    void renjuLite_allowsBlackBrokenDiagonalFourThreeMove() throws Exception {
        TestUser black =
                setupUserWithProfile(
                        "gomoku-broken-four-three-black@example.com",
                        "gomoku-broken-four-three-black",
                        "broken-four-three-black");
        TestUser white =
                setupUserWithProfile(
                        "gomoku-broken-four-three-white@example.com",
                        "gomoku-broken-four-three-white",
                        "broken-four-three-white");

        long roomId = createJoinedRoom(black, white, "RENJU_LITE");

        play(black.token(), roomId, 4, 4);
        play(white.token(), roomId, 0, 0);
        play(black.token(), roomId, 5, 5);
        play(white.token(), roomId, 0, 2);
        play(black.token(), roomId, 8, 8);
        play(white.token(), roomId, 0, 4);
        play(black.token(), roomId, 7, 5);
        play(white.token(), roomId, 1, 0);
        play(black.token(), roomId, 7, 6);
        play(white.token(), roomId, 1, 2);

        play(black.token(), roomId, 7, 7)
                .andExpect(jsonPath("$.data.status").value("PLAYING"))
                .andExpect(jsonPath("$.data.moveCount").value(11));
    }

    @Test
    void renjuLite_allowsBlackExactFiveEvenWhenItAlsoCreatesDoubleFour() throws Exception {
        TestUser black =
                setupUserWithProfile(
                        "gomoku-exact-five-black@example.com",
                        "gomoku-exact-five-black",
                        "exact-five-black");
        TestUser white =
                setupUserWithProfile(
                        "gomoku-exact-five-white@example.com",
                        "gomoku-exact-five-white",
                        "exact-five-white");

        long roomId = createJoinedRoom(black, white, "RENJU_LITE");

        seedMoves(
                roomId,
                List.of(
                        move(7, 3, GomokuStone.BLACK),
                        move(0, 0, GomokuStone.WHITE),
                        move(7, 4, GomokuStone.BLACK),
                        move(0, 2, GomokuStone.WHITE),
                        move(7, 5, GomokuStone.BLACK),
                        move(0, 4, GomokuStone.WHITE),
                        move(7, 6, GomokuStone.BLACK),
                        move(0, 6, GomokuStone.WHITE),
                        move(4, 7, GomokuStone.BLACK),
                        move(0, 8, GomokuStone.WHITE),
                        move(5, 7, GomokuStone.BLACK),
                        move(1, 0, GomokuStone.WHITE),
                        move(6, 7, GomokuStone.BLACK),
                        move(1, 3, GomokuStone.WHITE),
                        move(4, 4, GomokuStone.BLACK),
                        move(1, 5, GomokuStone.WHITE),
                        move(5, 5, GomokuStone.BLACK),
                        move(1, 7, GomokuStone.WHITE),
                        move(6, 6, GomokuStone.BLACK),
                        move(1, 9, GomokuStone.WHITE)));

        play(black.token(), roomId, 7, 7)
                .andExpect(jsonPath("$.data.status").value("FINISHED"))
                .andExpect(jsonPath("$.data.result").value("BLACK_WIN"))
                .andExpect(jsonPath("$.data.endReason").value("FIVE"));
    }

    @Test
    void openRooms_listsWaitingAndPlayingExcludesFinished() throws Exception {
        TestUser waitingHost =
                setupUserWithProfile(
                        "gomoku-open-waiting@example.com", "open-waiting", "open-waiting");
        TestUser playingBlack =
                setupUserWithProfile(
                        "gomoku-open-playing-black@example.com",
                        "open-playing-black",
                        "open-playing-black");
        TestUser playingWhite =
                setupUserWithProfile(
                        "gomoku-open-playing-white@example.com",
                        "open-playing-white",
                        "open-playing-white");
        TestUser viewer =
                setupUserWithProfile(
                        "gomoku-open-viewer@example.com", "open-viewer", "open-viewer");

        long waitingRoomId = createWaitingRoom(waitingHost, "FREESTYLE");
        long playingRoomId = createJoinedRoom(playingBlack, playingWhite, "FREESTYLE");

        mockMvc.perform(get("/gomoku/rooms").header("Authorization", "Bearer " + viewer.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2));

        play(playingBlack.token(), playingRoomId, 7, 7);
        play(playingWhite.token(), playingRoomId, 0, 0);
        play(playingBlack.token(), playingRoomId, 7, 8);
        play(playingWhite.token(), playingRoomId, 0, 1);
        play(playingBlack.token(), playingRoomId, 7, 9);
        play(playingWhite.token(), playingRoomId, 0, 2);
        play(playingBlack.token(), playingRoomId, 7, 10);
        play(playingWhite.token(), playingRoomId, 0, 3);
        play(playingBlack.token(), playingRoomId, 7, 11)
                .andExpect(jsonPath("$.data.status").value("FINISHED"));

        mockMvc.perform(get("/gomoku/rooms").header("Authorization", "Bearer " + viewer.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(waitingRoomId));
    }

    @Test
    void findRoom_allowsSpectatorOnPlayingRoom() throws Exception {
        TestUser black =
                setupUserWithProfile("gomoku-spec-black@example.com", "spec-black", "spec-black");
        TestUser white =
                setupUserWithProfile("gomoku-spec-white@example.com", "spec-white", "spec-white");
        TestUser spectator =
                setupUserWithProfile(
                        "gomoku-spec-viewer@example.com", "spec-viewer", "spec-viewer");

        long roomId = createJoinedRoom(black, white, "FREESTYLE");

        mockMvc.perform(
                        get("/gomoku/rooms/{roomId}", roomId)
                                .header("Authorization", "Bearer " + spectator.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.viewerRole").value("SPECTATOR"))
                .andExpect(jsonPath("$.data.status").value("PLAYING"));

        mockMvc.perform(
                        get("/gomoku/rooms/{roomId}", roomId)
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.viewerRole").value("PLAYER"))
                .andExpect(jsonPath("$.data.myStone").value("BLACK"));
    }

    @Test
    void findRoom_rejectsNonParticipantWhenWaiting() throws Exception {
        TestUser host =
                setupUserWithProfile("gomoku-wait-host@example.com", "wait-host", "wait-host");
        TestUser outsider =
                setupUserWithProfile("gomoku-wait-out@example.com", "wait-out", "wait-out");

        long roomId = createWaitingRoom(host, "FREESTYLE");

        mockMvc.perform(
                        get("/gomoku/rooms/{roomId}", roomId)
                                .header("Authorization", "Bearer " + outsider.token()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("GM-003"));
    }

    @Test
    void chat_allowsSpectatorSendDuringPlayAndTagsRole() throws Exception {
        TestUser black =
                setupUserWithProfile("gomoku-chat-black@example.com", "chat-black", "chat-black");
        TestUser white =
                setupUserWithProfile("gomoku-chat-white@example.com", "chat-white", "chat-white");
        TestUser spectator =
                setupUserWithProfile("gomoku-chat-spec@example.com", "chat-spec", "chat-spec");

        long roomId = createJoinedRoom(black, white, "FREESTYLE");

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/messages", roomId)
                                .header("Authorization", "Bearer " + black.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"content\":\"hi\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.senderRole").value("PLAYER"));

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/messages", roomId)
                                .header("Authorization", "Bearer " + spectator.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"content\":\"good game!\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.senderRole").value("SPECTATOR"));

        mockMvc.perform(
                        get("/gomoku/rooms/{roomId}/messages", roomId)
                                .header("Authorization", "Bearer " + spectator.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].senderRole").value("PLAYER"))
                .andExpect(jsonPath("$.data[1].senderRole").value("SPECTATOR"));
    }

    private void finishBlackWin(TestUser black, TestUser white) throws Exception {
        long roomId = createJoinedRoom(black, white, "FREESTYLE");
        play(black.token(), roomId, 7, 7);
        play(white.token(), roomId, 0, 0);
        play(black.token(), roomId, 7, 8);
        play(white.token(), roomId, 0, 1);
        play(black.token(), roomId, 7, 9);
        play(white.token(), roomId, 0, 2);
        play(black.token(), roomId, 7, 10);
        play(white.token(), roomId, 0, 3);
        play(black.token(), roomId, 7, 11).andExpect(jsonPath("$.data.status").value("FINISHED"));
    }

    private long createJoinedRoom(TestUser black, TestUser white, String ruleSet) throws Exception {
        long roomId = createWaitingJoinedRoom(black, white, ruleSet);

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/start", roomId)
                                .header("Authorization", "Bearer " + black.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PLAYING"));
        return roomId;
    }

    private long createWaitingRoom(TestUser black, String ruleSet) throws Exception {
        return objectMapper
                .readTree(
                        mockMvc.perform(
                                        post("/gomoku/rooms")
                                                .header("Authorization", "Bearer " + black.token())
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(createRoomRequest(ruleSet)))
                                .andExpect(status().isCreated())
                                .andReturn()
                                .getResponse()
                                .getContentAsString())
                .get("data")
                .get("id")
                .asLong();
    }

    private long createWaitingJoinedRoom(TestUser black, TestUser white, String ruleSet)
            throws Exception {
        long roomId =
                objectMapper
                        .readTree(
                                mockMvc.perform(
                                                post("/gomoku/rooms")
                                                        .header(
                                                                "Authorization",
                                                                "Bearer " + black.token())
                                                        .contentType(MediaType.APPLICATION_JSON)
                                                        .content(createRoomRequest(ruleSet)))
                                        .andExpect(status().isCreated())
                                        .andReturn()
                                        .getResponse()
                                        .getContentAsString())
                        .get("data")
                        .get("id")
                        .asLong();

        mockMvc.perform(
                        post("/gomoku/rooms/{roomId}/join", roomId)
                                .header("Authorization", "Bearer " + white.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING"));

        return roomId;
    }

    private void expireGomokuParticipant(long roomId, String columnName, LocalDateTime lastSeenAt) {
        assertThat(List.of("black_last_seen_at", "white_last_seen_at")).contains(columnName);
        jdbc.update(
                "UPDATE gomoku_matches SET " + columnName + " = ?, updated_at = ? WHERE id = ?",
                lastSeenAt,
                lastSeenAt,
                roomId);
    }

    private void seedMoves(Long roomId, List<GomokuMoveRecord> moves) throws Exception {
        GomokuMatch match = gomokuMatchRepository.findById(roomId).orElseThrow();
        match.applyMove(objectMapper.writeValueAsString(moves), GomokuStone.BLACK, moves.size());
        gomokuMatchRepository.save(match);
        gomokuMatchRepository.flush();
    }

    private GomokuMoveRecord move(int row, int col, GomokuStone stone) {
        return new GomokuMoveRecord(row, col, stone, LocalDateTime.now());
    }

    private org.springframework.test.web.servlet.ResultActions play(
            String token, long roomId, int row, int col) throws Exception {
        return attemptPlay(token, roomId, row, col).andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions attemptPlay(
            String token, long roomId, int row, int col) throws Exception {
        return mockMvc.perform(
                post("/gomoku/rooms/{roomId}/moves", roomId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"row\":" + row + ",\"col\":" + col + "}"));
    }

    private TestUser setupUserWithProfile(String email, String nickname, String patientNickname)
            throws Exception {
        String token = setupUser(email, nickname);
        String body =
                mockMvc.perform(
                                post("/patient-profiles")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"name\":\"Patient\",\"nickname\":\""
                                                        + patientNickname
                                                        + "\",\"birthDate\":\"2020-01-01\","
                                                        + "\"gender\":\"MALE\"}"))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        JsonNode profile = objectMapper.readTree(body).get("data");
        return new TestUser(token, profile.get("id").asLong());
    }

    private String setupUser(String email, String nickname) throws Exception {
        signup(email, nickname, "P@ssw0rd!");
        return login(email, "P@ssw0rd!");
    }

    private void signup(String email, String nickname, String password) throws Exception {
        mockMvc.perform(
                        post("/auth/signup")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"email\":\""
                                                + email
                                                + "\",\"nickname\":\""
                                                + nickname
                                                + "\",\"password\":\""
                                                + password
                                                + "\"}"))
                .andExpect(status().isCreated());
    }

    private String login(String email, String password) throws Exception {
        String body =
                mockMvc.perform(
                                post("/auth/login")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"email\":\""
                                                        + email
                                                        + "\",\"password\":\""
                                                        + password
                                                        + "\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("accessToken").asString();
    }

    private String createRoomRequest() {
        return createRoomRequest("FREESTYLE");
    }

    private String createRoomRequest(String ruleSet) {
        return "{\"ruleSet\":\"" + ruleSet + "\",\"timerSeconds\":300}";
    }

    private String createRoomRequest(String ruleSet, String textureKey) {
        return "{\"ruleSet\":\""
                + ruleSet
                + "\",\"timerSeconds\":300,\"textureKey\":\""
                + textureKey
                + "\"}";
    }

    private String joinRoomRequest(String textureKey) {
        return "{\"textureKey\":\"" + textureKey + "\"}";
    }

    private record TestUser(String token, Long patientProfileId) {}
}
