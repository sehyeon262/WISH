package com.comong.backend.domain.music.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.comong.backend.domain.music.config.YoutubeProperties;
import com.comong.backend.domain.music.dto.YoutubeSearchItemResponse;
import com.comong.backend.domain.music.dto.YoutubeSearchResponse;
import com.comong.backend.domain.music.exception.MusicErrorCode;
import com.comong.backend.global.exception.BusinessException;

import tools.jackson.databind.JsonNode;

/**
 * YouTube Data API v3 검색 프록시. 두 번의 호출을 합쳐 단일 응답으로 반환한다.
 *
 * <ol>
 *   <li>{@code search.list} — 음악 카테고리(10) 한정으로 비디오 검색
 *   <li>{@code videos.contentDetails} — 위 결과 ID 들의 ISO8601 duration 일괄 조회
 * </ol>
 *
 * <p>실패 정책: 키 미설정이면 {@code MU-005} (SERVICE_UNAVAILABLE), 외부 호출 실패면 {@code MU-006} (BAD_GATEWAY).
 */
@Service
public class YoutubeSearchService {

    private static final Logger log = LoggerFactory.getLogger(YoutubeSearchService.class);
    private static final Pattern ISO_DURATION =
            Pattern.compile("PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+(?:\\.\\d+)?)S)?");
    private static final int MAX_LIMIT = 20;
    private static final int DEFAULT_LIMIT = 8;
    private static final long DEFAULT_DURATION_MS = 180_000L;

    private final RestClient restClient;
    private final YoutubeProperties properties;

    public YoutubeSearchService(
            @Qualifier("youtubeRestClient") RestClient restClient, YoutubeProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    public YoutubeSearchResponse search(String query, Integer limit) {
        if (!properties.isEnabled()) {
            throw new BusinessException(MusicErrorCode.YOUTUBE_SEARCH_DISABLED);
        }
        if (query == null || query.isBlank()) {
            // 빈/공백 쿼리는 외부 호출 없이 빈 결과로 단락 — YouTube 의 400 으로 할당량을 낭비하지 않는다.
            return new YoutubeSearchResponse(List.of());
        }
        int safeLimit = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));

        try {
            JsonNode searchResult = callSearchList(query, safeLimit);
            List<String> videoIds = extractVideoIds(searchResult);
            if (videoIds.isEmpty()) {
                return new YoutubeSearchResponse(List.of());
            }
            Map<String, Long> durations = callVideoDurations(videoIds);
            return new YoutubeSearchResponse(buildItems(searchResult, durations));
        } catch (BusinessException be) {
            throw be;
        } catch (RuntimeException ex) {
            log.warn("YouTube search failed for query='{}': {}", query, ex.getMessage());
            throw new BusinessException(MusicErrorCode.YOUTUBE_SEARCH_FAILED);
        }
    }

    private JsonNode callSearchList(String query, int limit) {
        return restClient
                .get()
                .uri(
                        uriBuilder ->
                                uriBuilder
                                        .path("/search")
                                        .queryParam("part", "snippet")
                                        .queryParam("q", query)
                                        .queryParam("type", "video")
                                        .queryParam("videoCategoryId", "10")
                                        .queryParam("maxResults", limit)
                                        .queryParam("key", properties.apiKey())
                                        .build())
                .retrieve()
                .body(JsonNode.class);
    }

    private Map<String, Long> callVideoDurations(List<String> videoIds) {
        JsonNode response =
                restClient
                        .get()
                        .uri(
                                uriBuilder ->
                                        uriBuilder
                                                .path("/videos")
                                                .queryParam("part", "contentDetails")
                                                .queryParam("id", String.join(",", videoIds))
                                                .queryParam("key", properties.apiKey())
                                                .build())
                        .retrieve()
                        .body(JsonNode.class);

        Map<String, Long> result = new HashMap<>();
        if (response == null || !response.has("items")) {
            return result;
        }
        for (JsonNode item : response.get("items")) {
            String id = textOrNull(item, "id");
            JsonNode details = item.get("contentDetails");
            if (id == null || details == null) {
                continue;
            }
            String iso = textOrNull(details, "duration");
            result.put(id, parseIsoDurationMs(iso));
        }
        return result;
    }

    private List<String> extractVideoIds(JsonNode searchResult) {
        if (searchResult == null || !searchResult.has("items")) {
            return List.of();
        }
        List<String> ids = new ArrayList<>();
        for (JsonNode item : searchResult.get("items")) {
            JsonNode idNode = item.get("id");
            if (idNode == null) continue;
            String videoId = textOrNull(idNode, "videoId");
            if (videoId != null) {
                ids.add(videoId);
            }
        }
        return ids;
    }

    private List<YoutubeSearchItemResponse> buildItems(
            JsonNode searchResult, Map<String, Long> durations) {
        if (searchResult == null || !searchResult.has("items")) {
            return List.of();
        }
        return searchResult
                .get("items")
                .valueStream()
                .map(item -> toItem(item, durations))
                .filter(item -> item != null)
                .collect(Collectors.toList());
    }

    private YoutubeSearchItemResponse toItem(JsonNode item, Map<String, Long> durations) {
        JsonNode idNode = item.get("id");
        JsonNode snippet = item.get("snippet");
        if (idNode == null || snippet == null) return null;
        String videoId = textOrNull(idNode, "videoId");
        if (videoId == null) return null;

        String title = textOrEmpty(snippet, "title");
        String channelTitle = textOrEmpty(snippet, "channelTitle");
        String thumbnail = pickThumbnailUrl(snippet.get("thumbnails"));
        long durationMs = durations.getOrDefault(videoId, DEFAULT_DURATION_MS);

        return new YoutubeSearchItemResponse(videoId, title, channelTitle, thumbnail, durationMs);
    }

    private String pickThumbnailUrl(JsonNode thumbnails) {
        if (thumbnails == null) return "";
        for (String size : new String[] {"medium", "default", "high"}) {
            JsonNode node = thumbnails.get(size);
            if (node != null && node.has("url")) {
                return node.get("url").asString("");
            }
        }
        return "";
    }

    private static long parseIsoDurationMs(String iso) {
        if (iso == null) return DEFAULT_DURATION_MS;
        Matcher matcher = ISO_DURATION.matcher(iso);
        if (!matcher.matches()) return DEFAULT_DURATION_MS;
        long hours = parseLongOr(matcher.group(1), 0L);
        long minutes = parseLongOr(matcher.group(2), 0L);
        double seconds = parseDoubleOr(matcher.group(3), 0d);
        return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000d);
    }

    private static long parseLongOr(String value, long fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static double parseDoubleOr(String value, double fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static String textOrNull(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        String text = value.asString("");
        return text.isEmpty() ? null : text;
    }

    private static String textOrEmpty(JsonNode node, String field) {
        String value = textOrNull(node, field);
        return value == null ? "" : value;
    }
}
