package com.comong.backend.domain.performance.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.performance.entity.PerformanceVideo;

public interface PerformanceVideoRepository extends JpaRepository<PerformanceVideo, Long> {}
