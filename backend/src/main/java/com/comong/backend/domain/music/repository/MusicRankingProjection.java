package com.comong.backend.domain.music.repository;

import java.time.LocalDateTime;

public interface MusicRankingProjection {
    Long getPatientProfileId();

    String getNickname();

    Integer getScore();

    Double getAccuracy();

    Integer getMaxCombo();

    String getRankGrade();

    LocalDateTime getPlayedAt();
}
