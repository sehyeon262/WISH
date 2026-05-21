package com.comong.backend.domain.music.entity;

public enum MusicRank {
    S,
    A,
    B,
    C,
    D;

    public static MusicRank fromAccuracy(double accuracy) {
        if (accuracy >= 0.95) {
            return S;
        }
        if (accuracy >= 0.85) {
            return A;
        }
        if (accuracy >= 0.70) {
            return B;
        }
        if (accuracy >= 0.50) {
            return C;
        }
        return D;
    }
}
