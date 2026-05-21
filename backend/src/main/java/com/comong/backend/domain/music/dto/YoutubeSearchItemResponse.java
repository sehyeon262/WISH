package com.comong.backend.domain.music.dto;

/** YouTube 검색 결과 단일 아이템 — FE 의 VideoItem 형태와 1:1 매칭. */
public record YoutubeSearchItemResponse(
        String videoId, String title, String channelTitle, String thumbnailUrl, long durationMs) {}
