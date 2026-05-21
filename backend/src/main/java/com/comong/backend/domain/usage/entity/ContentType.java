package com.comong.backend.domain.usage.entity;

/**
 * 활동 시간 집계 대상 컨텐츠 분류. {@code daily_usage_stat.content_type} 컬럼 값으로 그대로 직렬화된다 ({@code
 * EnumType.STRING}).
 *
 * <ul>
 *   <li>{@link #LOGIN} — 앱 접속 시간 (컨텐츠 안 / 밖 모두 포함). source: {@code user_login_session}
 *   <li>{@link #ART} — 미술. source: {@code artworks.play_duration_seconds} (작품별 누적 → 일별 diff)
 *   <li>{@link #MUSIC} — 음악. source: {@code music_result.played_duration_ms}
 *   <li>{@link #TAEKWONDO} — 태권도. source: {@code taekwondo_session.duration_sec}
 *   <li>{@link #GYMNASTICS} — 체조. source: {@code exercise_session.duration_sec}
 * </ul>
 *
 * <p>VARCHAR(20) 으로 컬럼이 잡혀있어 새 enum 추가 시 길이 한도(20자) 안에서 명명할 것.
 */
public enum ContentType {
    LOGIN,
    ART,
    MUSIC,
    TAEKWONDO,
    GYMNASTICS
}
