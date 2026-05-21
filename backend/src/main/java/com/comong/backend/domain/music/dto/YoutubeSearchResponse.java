package com.comong.backend.domain.music.dto;

import java.util.List;

/** YouTube 검색 응답 래퍼. */
public record YoutubeSearchResponse(List<YoutubeSearchItemResponse> items) {}
