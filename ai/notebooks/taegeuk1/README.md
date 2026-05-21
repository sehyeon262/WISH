# 태극 1장 채점 모델 학습

소아암 아동을 위한 태권도 품새 시범 채점 시스템의 1장(태극 1장) 베이스라인.
JupyterHub 환경에서 진행한 학습/실험 노트북과 의사결정 기록을 보관한다.

> 관련 이슈: [S14P31E103-335](https://ssafy.atlassian.net/browse/S14P31E103-335)
> 부모 에픽: [S14P31E103-314](https://ssafy.atlassian.net/browse/S14P31E103-314) — 태권도 동작 분석 시스템

---

## 채점 방식 — LSTM Autoencoder + DTW 앙상블

DTW(베이스라인) 와 LSTM Autoencoder 두 방식을 각각 구현·평가한 후,
**가중평균 (LSTM × 0.6 + DTW × 0.4)** 방식을 최종 채택했다.

| 방식 | 특징 | 채택 |
| --- | --- | --- |
| DTW (스켈레톤 기반) | 학습 불필요, 해석 쉬움, 다소 느림 | 보조 (40%) |
| LSTM Autoencoder | 재구성 오차 기반, 빠른 추론 | 메인 (60%) |
| **LSTM + DTW 가중평균** | 두 방식의 장점 결합, 안정적 | ✅ 최종 |

### 측정 결과 ("앞서고 지르기" 50개 샘플)

`03_method_comparison_dtw_vs_lstm.ipynb` 출력 기준.

| 방식 | 평균 | 최고 | 최저 | 표준편차 | 속도 (ms/sample) |
| --- | ---: | ---: | ---: | ---: | ---: |
| DTW | 66.1 | 100.0 | 7.8 | 22.0 | 4.4 |
| LSTM | 65.3 | 100.0 | 9.1 | 21.0 | **0.9** |
| LSTM + DTW (앙상블) | 65.6 | 100.0 | 8.6 | 21.3 | (합산) |

> 🚨 **단일 동작("앞서고 지르기") · 50개 샘플 기준 — 일반화 X.** 8개 품새 동작 전체에 대한 성능 지표가 아니며, 표 수치만 보고 모델 품질을 판단하지 마세요. 검증 데이터셋 확보 후 [S14P31E103-343](https://ssafy.atlassian.net/browse/S14P31E103-343) 에서 동작별 / 전체 지표 재측정 예정.

**핵심 인사이트**: 점수 분포는 세 방식이 거의 동일하지만, **LSTM 추론이 DTW보다 약 5배 빠름** (0.9 vs 4.4 ms). 실시간 채점이 필요한 환경에서 LSTM 비중을 높게 잡았으며, DTW 를 보조로 두어 한쪽이 흔들릴 때 보완하도록 설계했다.

---

## 노트북 실행 순서

| 단계 | 파일 | 설명 |
| --- | --- | --- |
| 1 | `01_data_explore.ipynb` | AI Hub 71259 데이터셋 로딩, 키포인트 추출, 정규화 |
| 2 | `02_lstm_train.ipynb` | 동작별 LSTM Autoencoder 9개 학습, weights 저장 |
| 3 | `03_method_comparison_dtw_vs_lstm.ipynb` | DTW vs LSTM vs 앙상블 비교 및 최종 방식 결정 |

---

## 모델 구조

LSTM Autoencoder (`02_lstm_train.ipynb` 정의):

- 입력: 시퀀스 길이 60, 8개 관절 차원 (양 팔꿈치/어깨/무릎/엉덩이)
- Encoder: LSTM(8 → 64, 2-layer, dropout 0.2) → FC(64 → 32 latent)
- Decoder: FC(32 → 64) → LSTM(64 → 64) → FC(64 → 8)
- 학습 손실: MSE (재구성 오차)
- 동작별 별도 모델 9개 (기본준비 + 8개 품새 동작)

> 모델 클래스 추출 (`lstm_autoencoder.py`) 및 서비스 통합은 별도 이슈 예정. 현재는 노트북 내 클래스 정의를 그대로 사용한다.

---

## 파일 위치

| 항목 | 위치 |
| --- | --- |
| 학습 노트북 | `ai/notebooks/taegeuk1/*.ipynb` |
| 학습된 weights (9개, .pth) | `ai/app/models/taegeuk1/checkpoints/` |
| 비교 기준 템플릿 (8개, .npy) | `ai/app/resources/taegeuk1/templates/` |
| 채점 정규화 통계 (.json) | `ai/app/resources/taegeuk1/stats/` |
| 데이터셋 원본 (.gitignore) | (각자 로컬 / JupyterHub) |

---

## 통계 파일 생성 방법

`ai/app/resources/taegeuk1/stats/` 안의 두 JSON 은 채점 점수를 0~100 으로 정규화하기 위한 **percentile 룩업 테이블**이다. 어느 노트북에서 어떻게 만들어졌는지 명시한다.

### `distance_stats.json` — DTW 거리 percentile

- **생성 위치**: `03_method_comparison_dtw_vs_lstm.ipynb` 의 DTW 평가 단계
- **입력**: 동작별 시연자 시퀀스 (`~/taekwondo-scorer/processed/normalized/{action_name}/`)
- **처리**: 각 시퀀스 ↔ 기준 템플릿(`templates/{action_name}.npy`) 사이 DTW 거리 계산 → percentile (`min, p10, p25, p50, p75, p90, max`) 추출
- **사용처**: 채점 시 `dtw_distance` → 점수 변환 룩업

### `error_stats.json` — LSTM 재구성 오차 percentile

- **생성 위치**: `02_lstm_train.ipynb` 의 학습 후 평가 단계
- **입력**: 동작별 학습 데이터셋 → LSTM Autoencoder 통과
- **처리**: MSE 재구성 오차 → percentile 추출
- **사용처**: 채점 시 `recon_error` → 점수 변환 룩업

### 재계산 시 주의

- 데이터셋이나 모델이 바뀌면 두 파일 모두 재계산 필요
- 자동화된 재계산 스크립트 + 회귀 검증 메커니즘은 [S14P31E103-343](https://ssafy.atlassian.net/browse/S14P31E103-343) 에서 분리 예정
- 현 시점 두 파일은 **노트북 수동 실행 결과** 이며, 메타데이터(생성 시각, 데이터셋 버전 등) 는 포함되어 있지 않다

---

## 데이터셋

**AI Hub 71259** — 소아 태권도 품새 동작 데이터셋 (별도 다운로드 필요).

라이선스 및 용량 문제로 레포에는 포함하지 않는다. 노트북 실행 시 다음 경로에 직접 배치해야 한다:

```
~/taekwondo-scorer/data/        # 원본 영상/JSON
~/taekwondo-scorer/processed/   # 정규화된 키포인트
```

위 경로는 `01_data_explore.ipynb` / `02_lstm_train.ipynb` 상단 `BASE_DIR` 상수에서 변경 가능.

---

## 후속 작업 (별도 이슈)

- [S14P31E103-341](https://ssafy.atlassian.net/browse/S14P31E103-341) — LSTM AE 모델 클래스 모듈화 + FastAPI 채점 서비스 통합
- [S14P31E103-342](https://ssafy.atlassian.net/browse/S14P31E103-342) — 모델 가중치 버전 관리 정책 (Git LFS / DVC / 외부 스토리지 검토)
- [S14P31E103-343](https://ssafy.atlassian.net/browse/S14P31E103-343) — 통계 재계산 스크립트 + 회귀 검증 메커니즘
- 8개 품새 동작 전체에 대한 검증 데이터셋 / 지표 재측정 (위 343 이슈에 포함)
