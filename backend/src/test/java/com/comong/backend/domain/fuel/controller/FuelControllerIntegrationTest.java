package com.comong.backend.domain.fuel.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.fuel.repository.FuelEventRepository;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class FuelControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private FuelEventRepository fuelEventRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;

    @BeforeEach
    void cleanDb() {
        cleanAll();
    }

    @AfterEach
    void cleanDbAfter() {
        cleanAll();
    }

    @Test
    void sendStatusInboxAndConsumeFlow() throws Exception {
        String token = setupUserWithProfile("fuel-flow@example.com", "fuel-flow");

        long eventId = sendFuel(token, 40, " Shine bright ");

        mockMvc.perform(get("/fuel/status").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.percentage").value(40))
                .andExpect(jsonPath("$.data.totalAmount").value(40))
                .andExpect(jsonPath("$.data.completed").value(false))
                .andExpect(jsonPath("$.data.events[0].id").value(eventId))
                .andExpect(jsonPath("$.data.events[0].message").value("Shine bright"))
                .andExpect(jsonPath("$.data.events[0].consumedAt").doesNotExist());

        mockMvc.perform(get("/fuel/inbox").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(eventId))
                .andExpect(jsonPath("$.data[0].amount").value(40))
                .andExpect(jsonPath("$.data[0].message").value("Shine bright"));

        mockMvc.perform(
                        post("/fuel/consume")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"ids\":[" + eventId + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(1));

        mockMvc.perform(get("/fuel/inbox").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0]").doesNotExist());

        mockMvc.perform(get("/fuel/status").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.events[0].consumedAt").exists());
    }

    @Test
    void sendRejectsWhenFuelAlreadyCompleted() throws Exception {
        String token = setupUserWithProfile("fuel-complete@example.com", "fuel-complete");
        sendFuel(token, 100, "Complete");

        mockMvc.perform(
                        post("/fuel")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"amount\":1,\"message\":\"Again\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FL-001"));

        assertThat(fuelEventRepository.count()).isEqualTo(1);
    }

    @Test
    void statusClampsPercentageAfterCrossingOneHundred() throws Exception {
        String token = setupUserWithProfile("fuel-clamp@example.com", "fuel-clamp");
        sendFuel(token, 90, "Almost there");
        sendFuel(token, 20, "Final push");

        mockMvc.perform(get("/fuel/status").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.percentage").value(100))
                .andExpect(jsonPath("$.data.totalAmount").value(110))
                .andExpect(jsonPath("$.data.completed").value(true));

        mockMvc.perform(
                        post("/fuel")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"amount\":1,\"message\":\"Blocked\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FL-001"));
    }

    @Test
    void consumeIgnoresOtherPatientsEvents() throws Exception {
        String ownerToken = setupUserWithProfile("fuel-owner@example.com", "fuel-owner");
        long ownerEventId = sendFuel(ownerToken, 30, "Owner message");
        String otherToken = setupUserWithProfile("fuel-other@example.com", "fuel-other");

        mockMvc.perform(
                        post("/fuel/consume")
                                .header("Authorization", "Bearer " + otherToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"ids\":[" + ownerEventId + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(0));

        mockMvc.perform(get("/fuel/inbox").header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(ownerEventId));
    }

    @Test
    void sendRejectsInvalidRequest() throws Exception {
        String token = setupUserWithProfile("fuel-invalid@example.com", "fuel-invalid");

        mockMvc.perform(
                        post("/fuel")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"amount\":0,\"message\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"))
                .andExpect(jsonPath("$.errors.amount").exists())
                .andExpect(jsonPath("$.errors.message").exists());
    }

    @Test
    void statusRequiresPatientProfile() throws Exception {
        String token = setupUser("fuel-noprofile@example.com", "fuel-noprofile");

        mockMvc.perform(get("/fuel/status").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    private long sendFuel(String token, int amount, String message) throws Exception {
        String body =
                mockMvc.perform(
                                post("/fuel")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"amount\":"
                                                        + amount
                                                        + ",\"message\":\""
                                                        + message
                                                        + "\"}"))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("id").asLong();
    }

    private String setupUserWithProfile(String email, String nickname) throws Exception {
        String token = setupUser(email, nickname);
        mockMvc.perform(
                        post("/patient-profiles")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"Patient\",\"nickname\":\""
                                                + nickname
                                                + "-patient\","
                                                + "\"birthDate\":\"2020-01-01\","
                                                + "\"gender\":\"MALE\"}"))
                .andExpect(status().isCreated());
        return token;
    }

    private String setupUser(String email, String nickname) throws Exception {
        signup(email, nickname, "P@ssw0rd!");
        return login(email, "P@ssw0rd!");
    }

    private void signup(String email, String nickname, String password) throws Exception {
        mockMvc.perform(
                        post("/auth/signup")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"email\":\""
                                                + email
                                                + "\",\"nickname\":\""
                                                + nickname
                                                + "\",\"password\":\""
                                                + password
                                                + "\"}"))
                .andExpect(status().isCreated());
    }

    private String login(String email, String password) throws Exception {
        String body =
                mockMvc.perform(
                                post("/auth/login")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"email\":\""
                                                        + email
                                                        + "\",\"password\":\""
                                                        + password
                                                        + "\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("accessToken").asString();
    }

    private void cleanAll() {
        fuelEventRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }
}
