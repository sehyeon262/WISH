package com.comong.backend.domain.dialogue.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;

@Component
public class LighthouseIntentCatalog {

    private static final Map<String, ChoiceIntentMetadata> METADATA =
            Map.ofEntries(
                    entry(
                            "entry_rest",
                            1,
                            List.of("needs_rest"),
                            List.of("sets_boundary", "rest_need_named")),
                    entry(
                            "entry_activity",
                            0,
                            List.of(),
                            List.of("agency_coping", "positive_activity_interest")),
                    entry(
                            "entry_talk",
                            0,
                            List.of(),
                            List.of("support_seeking", "verbal_expression")),
                    entry("rest_quiet", 1, List.of("needs_rest"), List.of("sets_boundary")),
                    entry(
                            "rest_close_eyes",
                            1,
                            List.of("fatigue_present"),
                            List.of("self_care_action", "rest_need_named")),
                    entry(
                            "rest_near_family",
                            0,
                            List.of(),
                            List.of("family_support_preference", "support_need_named")),
                    entry(
                            "activity_music",
                            0,
                            List.of(),
                            List.of("positive_activity_interest", "music_interest")),
                    entry(
                            "activity_art",
                            0,
                            List.of(),
                            List.of("creative_expression", "positive_activity_interest")),
                    entry(
                            "activity_move",
                            0,
                            List.of(),
                            List.of("movement_interest", "agency_coping")),
                    entry("talk_body", 0, List.of(), List.of("body_checkin_interest")),
                    entry("talk_peer", 0, List.of(), List.of("social_connection_interest")),
                    entry(
                            "talk_worry",
                            1,
                            List.of("worry_present"),
                            List.of("emotion_named", "support_seeking")),
                    entry("body_okay", 0, List.of(), List.of("positive_body_state")),
                    entry(
                            "body_tired",
                            2,
                            List.of("fatigue_present", "body_discomfort"),
                            List.of("body_state_named")),
                    entry(
                            "body_pain_worry",
                            3,
                            List.of("pain_concern", "procedure_fear"),
                            List.of("can_name_fear")),
                    entry(
                            "body_tell_adult",
                            0,
                            List.of(),
                            List.of("support_seeking", "adult_support_preference")),
                    entry(
                            "body_point_place",
                            1,
                            List.of("prefers_nonverbal_expression"),
                            List.of("alternative_expression", "body_state_named")),
                    entry(
                            "body_hold_hand",
                            1,
                            List.of("needs_comfort"),
                            List.of("comfort_preference_named", "support_need_named")),
                    entry(
                            "peer_miss",
                            2,
                            List.of("peer_separation", "loneliness"),
                            List.of("relationship_named")),
                    entry(
                            "peer_school",
                            1,
                            List.of("school_connection"),
                            List.of("social_connection", "information_seeking")),
                    entry("peer_okay", 0, List.of(), List.of("positive_social_state")),
                    entry(
                            "worry_hospital",
                            2,
                            List.of("hospital_worry", "worry_present"),
                            List.of("emotion_named")),
                    entry(
                            "worry_family",
                            3,
                            List.of("family_worry", "parent_concern"),
                            List.of("relationship_named", "empathy")),
                    entry(
                            "worry_upset",
                            2,
                            List.of("anger_or_frustration", "distress_present"),
                            List.of("emotion_named")),
                    entry(
                            "hospital_injection",
                            3,
                            List.of("procedure_fear", "pain_concern"),
                            List.of("can_name_fear")),
                    entry(
                            "hospital_unknown",
                            2,
                            List.of("uncertainty", "information_need"),
                            List.of("uncertainty_named")),
                    entry("hospital_okay", 0, List.of(), List.of("positive_mood")),
                    entry(
                            "support_family",
                            0,
                            List.of(),
                            List.of("family_support_preference", "support_need_named")),
                    entry(
                            "support_teacher",
                            0,
                            List.of(),
                            List.of("information_seeking", "medical_support_preference")),
                    entry(
                            "support_hold_hand",
                            1,
                            List.of("needs_comfort"),
                            List.of("comfort_preference_named", "support_need_named")),
                    entry(
                            "express_words",
                            0,
                            List.of(),
                            List.of("verbal_expression", "family_support_preference")),
                    entry(
                            "express_drawing",
                            0,
                            List.of("prefers_nonverbal_expression"),
                            List.of("creative_expression", "alternative_expression")),
                    entry(
                            "express_private",
                            1,
                            List.of("hesitation_to_share"),
                            List.of("sets_boundary")),
                    entry(
                            "anger_pause",
                            1,
                            List.of("anger_or_frustration"),
                            List.of("pause_coping", "self_regulation")),
                    entry(
                            "anger_say_upset",
                            1,
                            List.of("anger_or_frustration"),
                            List.of("emotion_named", "verbal_expression")),
                    entry(
                            "anger_call_help",
                            1,
                            List.of("anger_or_frustration"),
                            List.of("support_seeking", "self_regulation")),
                    // Legacy ids kept so older clients and stored fallback flows still work.
                    entry("mood_okay", 0, List.of(), List.of("positive_mood")),
                    entry("mood_worried", 2, List.of("worry_present"), List.of("emotion_named")),
                    entry("mood_hard", 2, List.of("distress_present"), List.of("emotion_named")),
                    entry("rest_today", 1, List.of("ended_checkin"), List.of("sets_boundary")),
                    entry(
                            "worry_pain",
                            3,
                            List.of("pain_concern", "procedure_fear"),
                            List.of("can_name_fear")),
                    entry(
                            "worry_unknown",
                            2,
                            List.of("uncertainty"),
                            List.of("information_need_named")),
                    entry("hard_body", 3, List.of("body_discomfort"), List.of("body_state_named")),
                    entry("hard_lonely", 3, List.of("loneliness"), List.of("emotion_named")),
                    entry(
                            "hard_angry",
                            2,
                            List.of("anger_or_frustration"),
                            List.of("emotion_named")),
                    entry("support_medical", 0, List.of(), List.of("medical_support_preference")),
                    entry(
                            "support_draw",
                            0,
                            List.of("prefers_nonverbal_expression"),
                            List.of("alternative_expression")),
                    entry("action_breathe", 0, List.of(), List.of("breathing_coping")),
                    entry("action_draw", 0, List.of(), List.of("creative_expression")),
                    entry("action_tell", 0, List.of(), List.of("adult_support_plan")));

    public Optional<ChoiceIntentMetadata> lookup(String choiceIntentId) {
        return Optional.ofNullable(METADATA.get(choiceIntentId));
    }

    private static Map.Entry<String, ChoiceIntentMetadata> entry(
            String intentId,
            int intensity,
            List<String> concernFlags,
            List<String> protectiveFactors) {
        return Map.entry(
                intentId,
                new ChoiceIntentMetadata((short) intensity, concernFlags, protectiveFactors));
    }

    public record ChoiceIntentMetadata(
            short intensity, List<String> concernFlags, List<String> protectiveFactors) {}
}
