-- V24: Add fuel_event for guardian fuel messages.
--
-- Product rules:
--   - Gauge is derived from the lifetime sum of amount per patient.
--   - consumed_at only tracks whether the game already rendered the message.
--   - There is no reset and no decrease.

CREATE TABLE fuel_event (
    id           BIGSERIAL      PRIMARY KEY,
    patient_id   BIGINT         NOT NULL,
    sender_id    BIGINT         NOT NULL,
    amount       INTEGER        NOT NULL,
    message      VARCHAR(100)   NOT NULL,
    created_at   TIMESTAMP(6)   NOT NULL,
    consumed_at  TIMESTAMP(6),
    CONSTRAINT fk_fuel_event_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_fuel_event_sender
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT ck_fuel_event_amount_range CHECK (amount >= 1 AND amount <= 100)
);

CREATE INDEX idx_fuel_event_patient_created
    ON fuel_event (patient_id, created_at DESC, id DESC);

CREATE INDEX idx_fuel_event_patient_unconsumed
    ON fuel_event (patient_id, created_at ASC, id ASC)
    WHERE consumed_at IS NULL;
