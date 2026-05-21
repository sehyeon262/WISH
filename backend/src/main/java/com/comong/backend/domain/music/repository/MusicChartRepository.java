package com.comong.backend.domain.music.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.music.entity.MusicChart;

public interface MusicChartRepository extends JpaRepository<MusicChart, Long> {

    Optional<MusicChart> findByChartIdAndActiveTrue(String chartId);
}
