package com.comong.backend.domain.village.realtime.exception;

/**
 * 룸 정원 ({@code app.realtime.village.room-capacity}) 초과로 신규 입장이 거부된 경우. STOMP CONNECT 인터셉터에서 {@code
 * MessagingException} 으로 래핑되어 클라에 ERROR 프레임으로 전달된다.
 */
public class VillageRoomFullException extends RuntimeException {

    public VillageRoomFullException(int capacity) {
        super("village room full (capacity=" + capacity + ")");
    }
}
