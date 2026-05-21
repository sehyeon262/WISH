-- V15: Align exercise_motion routine ordering with taekwondo_motion.
--
-- The admin UI can reorder multiple motions in one transaction. Making the
-- unique constraint DEFERRABLE INITIALLY DEFERRED allows temporary swaps inside
-- that transaction while still rejecting duplicates at commit.

ALTER TABLE exercise_motion
    DROP CONSTRAINT uk_exercise_motion_exercise_type_routine_order;

ALTER TABLE exercise_motion
    ADD CONSTRAINT uk_exercise_motion_exercise_type_routine_order
        UNIQUE (exercise_type, routine_order) DEFERRABLE INITIALLY DEFERRED;
