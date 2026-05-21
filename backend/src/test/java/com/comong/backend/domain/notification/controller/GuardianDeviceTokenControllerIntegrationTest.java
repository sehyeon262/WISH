package com.comong.backend.domain.notification.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.notification.entity.DevicePlatform;
import com.comong.backend.domain.notification.entity.GuardianDeviceToken;
import com.comong.backend.domain.notification.repository.GuardianDeviceTokenRepository;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class GuardianDeviceTokenControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private GuardianDeviceTokenRepository guardianDeviceTokenRepository;
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

    private void cleanAll() {
        guardianDeviceTokenRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void registerDeviceToken_createsActiveToken() throws Exception {
        String token = setupUserWithProfile("device-create@example.com", "device-create");
        long patientProfileId = ownProfileId(token);

        mockMvc.perform(
                        post("/notifications/device-tokens")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "token": "fcm-token-1",
                                          "platform": "WEB",
                                          "userAgent": "Mozilla/5.0",
                                          "patientProfileId": %d
                                        }
                                        """
                                                .formatted(patientProfileId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.platform").value("WEB"))
                .andExpect(jsonPath("$.data.active").value(true))
                .andExpect(jsonPath("$.data.createdAt").isString())
                .andExpect(jsonPath("$.data.updatedAt").isString())
                .andExpect(jsonPath("$.data.token").doesNotExist());

        GuardianDeviceToken saved =
                guardianDeviceTokenRepository.findByDeviceToken("fcm-token-1").orElseThrow();
        assertThat(saved.getPlatform()).isEqualTo(DevicePlatform.WEB);
        assertThat(saved.getUserAgent()).isEqualTo("Mozilla/5.0");
        assertThat(saved.isActive()).isTrue();
    }

    @Test
    void registerSameToken_updatesExistingTokenWithoutDuplicate() throws Exception {
        String token = setupUserWithProfile("device-update@example.com", "device-update");

        registerDeviceToken(token, "fcm-token-2", "WEB", "first-agent", null);
        registerDeviceToken(token, "fcm-token-2", "IOS", "second-agent", null);

        assertThat(guardianDeviceTokenRepository.findAll()).hasSize(1);
        GuardianDeviceToken saved =
                guardianDeviceTokenRepository.findByDeviceToken("fcm-token-2").orElseThrow();
        assertThat(saved.getPlatform()).isEqualTo(DevicePlatform.IOS);
        assertThat(saved.getUserAgent()).isEqualTo("second-agent");
        assertThat(saved.isActive()).isTrue();
        assertThat(saved.getDeactivatedAt()).isNull();
    }

    @Test
    void registerSameTokenConcurrently_keepsSingleRow() throws Exception {
        String firstToken = setupUserWithProfile("device-race-first@example.com", "device-race-1");
        String secondToken =
                setupUserWithProfile("device-race-second@example.com", "device-race-2");
        long firstUserId = userIdFromToken(firstToken);
        long secondUserId = userIdFromToken(secondToken);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try {
            Future<Void> firstRegister =
                    executor.submit(
                            () -> {
                                awaitConcurrentStart(ready, start);
                                registerDeviceToken(
                                        firstToken, "fcm-token-race", "WEB", "first-agent", null);
                                return null;
                            });
            Future<Void> secondRegister =
                    executor.submit(
                            () -> {
                                awaitConcurrentStart(ready, start);
                                registerDeviceToken(
                                        secondToken, "fcm-token-race", "IOS", "second-agent", null);
                                return null;
                            });

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            firstRegister.get(10, TimeUnit.SECONDS);
            secondRegister.get(10, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }

        assertThat(guardianDeviceTokenRepository.findAll()).hasSize(1);
        GuardianDeviceToken saved =
                guardianDeviceTokenRepository.findByDeviceToken("fcm-token-race").orElseThrow();
        boolean belongsToFirst =
                guardianDeviceTokenRepository
                        .findByUserIdAndDeviceToken(firstUserId, "fcm-token-race")
                        .isPresent();
        boolean belongsToSecond =
                guardianDeviceTokenRepository
                        .findByUserIdAndDeviceToken(secondUserId, "fcm-token-race")
                        .isPresent();
        assertThat(belongsToFirst || belongsToSecond).isTrue();
        assertThat(saved.isActive()).isTrue();
        assertThat(saved.getDeactivatedAt()).isNull();
    }

    @Test
    void registerTokenOwnedByOtherUser_movesOwnershipToCurrentUser() throws Exception {
        String firstToken = setupUserWithProfile("device-first@example.com", "device-first");
        String secondToken = setupUserWithProfile("device-second@example.com", "device-second");
        long firstUserId = userIdFromToken(firstToken);
        long secondUserId = userIdFromToken(secondToken);

        registerDeviceToken(firstToken, "fcm-token-3", "WEB", null, null);
        registerDeviceToken(secondToken, "fcm-token-3", "WEB", null, null);

        assertThat(
                        guardianDeviceTokenRepository.findByUserIdAndDeviceToken(
                                firstUserId, "fcm-token-3"))
                .isEmpty();
        assertThat(
                        guardianDeviceTokenRepository.findByUserIdAndDeviceToken(
                                secondUserId, "fcm-token-3"))
                .isPresent();
    }

    @Test
    void deactivateDeviceToken_marksTokenInactive() throws Exception {
        String token = setupUserWithProfile("device-delete@example.com", "device-delete");
        registerDeviceToken(token, "fcm-token-4", "WEB", null, null);

        mockMvc.perform(
                        delete("/notifications/device-tokens")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"token\":\"fcm-token-4\"}"))
                .andExpect(status().isNoContent());

        GuardianDeviceToken saved =
                guardianDeviceTokenRepository.findByDeviceToken("fcm-token-4").orElseThrow();
        assertThat(saved.isActive()).isFalse();
        assertThat(saved.getDeactivatedAt()).isNotNull();
    }

    @Test
    void deactivateUnknownDeviceToken_isNoContent() throws Exception {
        String token = setupUserWithProfile("device-delete-noop@example.com", "device-delete-noop");

        mockMvc.perform(
                        delete("/notifications/device-tokens")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"token\":\"missing-token\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    void registerDeviceToken_otherUsersPatientProfile_returns404WithP001() throws Exception {
        String ownerToken = setupUserWithProfile("device-owner@example.com", "device-owner");
        long otherPatientProfileId = ownProfileId(ownerToken);
        String otherToken = setupUserWithProfile("device-other@example.com", "device-other");

        mockMvc.perform(
                        post("/notifications/device-tokens")
                                .header("Authorization", "Bearer " + otherToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "token": "fcm-token-5",
                                          "platform": "WEB",
                                          "patientProfileId": %d
                                        }
                                        """
                                                .formatted(otherPatientProfileId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    void registerDeviceToken_requiresAuthentication() throws Exception {
        mockMvc.perform(
                        post("/notifications/device-tokens")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"token\":\"fcm-token-6\",\"platform\":\"WEB\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    private void registerDeviceToken(
            String accessToken,
            String deviceToken,
            String platform,
            String userAgent,
            Long patientProfileId)
            throws Exception {
        String patientProfileField =
                patientProfileId != null ? ",\"patientProfileId\":" + patientProfileId : "";
        String userAgentField = userAgent != null ? ",\"userAgent\":\"" + userAgent + "\"" : "";

        mockMvc.perform(
                        post("/notifications/device-tokens")
                                .header("Authorization", "Bearer " + accessToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"token\":\""
                                                + deviceToken
                                                + "\",\"platform\":\""
                                                + platform
                                                + "\""
                                                + userAgentField
                                                + patientProfileField
                                                + "}"))
                .andExpect(status().isOk());
    }

    private void awaitConcurrentStart(CountDownLatch ready, CountDownLatch start)
            throws InterruptedException {
        ready.countDown();
        assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
    }

    private long ownProfileId(String token) throws Exception {
        String body =
                mockMvc.perform(get("/patient-profiles").header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get(0).get("id").asLong();
    }

    private long userIdFromToken(String token) throws Exception {
        JsonNode payload = decodeTokenPayload(token);
        return payload.get("sub").asLong();
    }

    private JsonNode decodeTokenPayload(String token) throws Exception {
        String[] parts = token.split("\\.");
        byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
        return objectMapper.readTree(new String(payload, StandardCharsets.UTF_8));
    }

    private String setupUserWithProfile(String email, String nickname) throws Exception {
        String token = setupUser(email, nickname);
        mockMvc.perform(
                        post("/patient-profiles")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"Patient\",\"nickname\":\"patient\","
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
}
