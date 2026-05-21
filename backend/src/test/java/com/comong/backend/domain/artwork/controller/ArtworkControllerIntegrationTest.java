package com.comong.backend.domain.artwork.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import com.comong.backend.domain.artwork.repository.ArtworkRepository;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class ArtworkControllerIntegrationTest extends IntegrationTestSupport {

    /**
     * PNG signature 8 byte + 4 byte filler — magic-bytes 검증 통과 (LocalImageStorage MAGIC_HEAD_SIZE).
     */
    private static final byte[] PNG_BYTES = {
        (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0
    };

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ArtworkRepository artworkRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;

    @BeforeEach
    void cleanDb() {
        cleanAll();
    }

    /**
     * 테스트 간 격리 보장 — 본 테스트 클래스 수행 후 다른 테스트 클래스의 {@code @BeforeEach} 가 patient/user 만 지우고 artwork 를
     * 모르는 케이스에서 FK 위반이 발생하지 않도록 정리. (artwork 라는 자식 테이블이 추가됐다는 사실을 다른 테스트가 몰라도 안전.)
     */
    @AfterEach
    void cleanDbAfter() {
        cleanAll();
    }

    private void cleanAll() {
        artworkRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void createArtwork_persistsAndReturnsLocation() throws Exception {
        String token = setupUserWithProfile("alice@example.com", "alice", "Alice", "alice-kid");

        mockMvc.perform(
                        artworkMultipart(HttpMethod.POST, "/artworks")
                                .file(imagePart())
                                .file(
                                        requestPart(
                                                "{\"sketchCode\":1,\"playDurationSeconds\":60,\"colorCount\":5,\"isPublic\":false}"))
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.sketchCode").value(1))
                .andExpect(jsonPath("$.data.playDurationSeconds").value(60))
                .andExpect(jsonPath("$.data.colorCount").value(5))
                .andExpect(jsonPath("$.data.isPublic").value(false))
                .andExpect(
                        jsonPath("$.data.imageUrl")
                                .value(org.hamcrest.Matchers.startsWith("/api/v1/uploads/")));

        assertThat(artworkRepository.count()).isEqualTo(1);
    }

    @Test
    void createArtwork_withoutSketchCode_succeedsAsFreeDrawing() throws Exception {
        // V5: sketch_code nullable. 자유 그리기 (밑그림 없는 작품) 시나리오.
        String token = setupUserWithProfile("free@example.com", "freeArtist", "Free", "free-kid");

        mockMvc.perform(
                        artworkMultipart(HttpMethod.POST, "/artworks")
                                .file(imagePart())
                                .file(
                                        requestPart(
                                                "{\"playDurationSeconds\":30,\"colorCount\":0,\"isPublic\":false}"))
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.sketchCode").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.playDurationSeconds").value(30))
                .andExpect(jsonPath("$.data.colorCount").value(0));
    }

    @Test
    void createArtwork_rejectsNegativePlayDuration() throws Exception {
        String token = setupUserWithProfile("bob@example.com", "bob", "Bob", "bob-kid");

        mockMvc.perform(
                        artworkMultipart(HttpMethod.POST, "/artworks")
                                .file(imagePart())
                                .file(
                                        requestPart(
                                                "{\"sketchCode\":1,\"playDurationSeconds\":-5,\"colorCount\":1,\"isPublic\":false}"))
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    @Test
    void createArtwork_rejectsMissingColorCount() throws Exception {
        // 615: colorCount 는 @NotNull. 누락 시 G-001 로 차단.
        String token = setupUserWithProfile("nocolor@example.com", "nocolor", "N", "nk");

        mockMvc.perform(
                        artworkMultipart(HttpMethod.POST, "/artworks")
                                .file(imagePart())
                                .file(
                                        requestPart(
                                                "{\"sketchCode\":1,\"playDurationSeconds\":10,\"isPublic\":false}"))
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    @Test
    void createArtwork_rejectsNegativeColorCount() throws Exception {
        // 615: 도안 팔레트 크기에 따라 상한이 달라 0 이상만 강제.
        String token = setupUserWithProfile("negcolor@example.com", "negcolor", "N", "nk");

        mockMvc.perform(
                        artworkMultipart(HttpMethod.POST, "/artworks")
                                .file(imagePart())
                                .file(
                                        requestPart(
                                                "{\"sketchCode\":1,\"playDurationSeconds\":10,\"colorCount\":-1,\"isPublic\":false}"))
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    @Test
    void getMyList_returnsOnlyOwnArtworks() throws Exception {
        String aliceToken = setupUserWithProfile("alice2@example.com", "alice2", "A", "ak");
        String bobToken = setupUserWithProfile("bob2@example.com", "bob2", "B", "bk");
        createArtwork(aliceToken, 1, false);
        createArtwork(bobToken, 2, false);

        mockMvc.perform(get("/artworks/me").header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].sketchCode").value(1));
    }

    @Test
    void getPublicList_anonymousAllowed() throws Exception {
        String token = setupUserWithProfile("public@example.com", "public", "P", "pk");
        createArtwork(token, 10, true);
        createArtwork(token, 11, false);

        mockMvc.perform(get("/artworks/public"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].sketchCode").value(10))
                .andExpect(jsonPath("$.data.content[0].colorCount").value(0))
                // 공개 응답 author 는 nickname 만 노출, 내부 PK (patientProfileId) 는 응답에서 제외
                .andExpect(jsonPath("$.data.content[0].author.nickname").value("pk"))
                .andExpect(jsonPath("$.data.content[0].author.patientProfileId").doesNotExist());
    }

    @Test
    void createArtwork_rejectsMissingImagePart() throws Exception {
        String token = setupUserWithProfile("missing@example.com", "missing", "M", "mk");

        mockMvc.perform(
                        artworkMultipart(HttpMethod.POST, "/artworks")
                                // image 파트 누락
                                .file(
                                        requestPart(
                                                "{\"sketchCode\":1,\"playDurationSeconds\":0,\"colorCount\":0,\"isPublic\":false}"))
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    @Test
    void createArtwork_rejectsMissingRequestPart() throws Exception {
        String token = setupUserWithProfile("missing2@example.com", "missing2", "M", "mk");

        mockMvc.perform(
                        artworkMultipart(HttpMethod.POST, "/artworks")
                                .file(imagePart())
                                // request 파트 누락
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    @Test
    void getDetail_publicAccessibleByAnonymous() throws Exception {
        String token = setupUserWithProfile("carol@example.com", "carol", "Carol", "carol-kid");
        Long id = createArtwork(token, 1, true);

        mockMvc.perform(get("/artworks/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sketchCode").value(1));
    }

    @Test
    void getDetail_privateReturnsNotFoundToOthers() throws Exception {
        String aliceToken = setupUserWithProfile("alice3@example.com", "alice3", "A", "ak");
        String bobToken = setupUserWithProfile("bob3@example.com", "bob3", "B", "bk");
        Long id = createArtwork(aliceToken, 1, false);

        // anon
        mockMvc.perform(get("/artworks/" + id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AR-001"));

        // 다른 사용자
        mockMvc.perform(get("/artworks/" + id).header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AR-001"));
    }

    @Test
    void deleteArtwork_byOwnerSucceeds_byOtherForbidden() throws Exception {
        String aliceToken = setupUserWithProfile("alice4@example.com", "alice4", "A", "ak");
        String bobToken = setupUserWithProfile("bob4@example.com", "bob4", "B", "bk");
        Long id = createArtwork(aliceToken, 1, true);

        // 다른 사용자 삭제 시도 → 403 (소유권 없음)
        mockMvc.perform(delete("/artworks/" + id).header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("AR-002"));

        // 본인 삭제 → 204
        mockMvc.perform(delete("/artworks/" + id).header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isNoContent());

        assertThat(artworkRepository.count()).isZero();
    }

    // ---- helpers ----

    private String setupUserWithProfile(
            String email, String nickname, String patientName, String patientNickname)
            throws Exception {
        signup(email, nickname, "P@ssw0rd!");
        String token = login(email, "P@ssw0rd!");
        createPatientProfile(token, patientName, patientNickname);
        return token;
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

    private void createPatientProfile(String token, String name, String nickname) throws Exception {
        mockMvc.perform(
                        post("/patient-profiles")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\""
                                                + name
                                                + "\",\"nickname\":\""
                                                + nickname
                                                + "\",\"birthDate\":\"2020-01-01\",\"gender\":\"MALE\"}"))
                .andExpect(status().isCreated());
    }

    private Long createArtwork(String token, int sketchCode, boolean isPublic) throws Exception {
        String body =
                mockMvc.perform(
                                artworkMultipart(HttpMethod.POST, "/artworks")
                                        .file(imagePart())
                                        .file(
                                                requestPart(
                                                        "{\"sketchCode\":"
                                                                + sketchCode
                                                                + ",\"playDurationSeconds\":10,\"colorCount\":0,\"isPublic\":"
                                                                + isPublic
                                                                + "}"))
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("id").asLong();
    }

    private MockMultipartHttpServletRequestBuilder artworkMultipart(HttpMethod method, String url) {
        return method == HttpMethod.POST ? multipart(url) : multipart(method, url);
    }

    private MockMultipartFile imagePart() {
        return new MockMultipartFile("image", "test.png", "image/png", PNG_BYTES);
    }

    private MockMultipartFile requestPart(String json) {
        return new MockMultipartFile(
                "request", "request", MediaType.APPLICATION_JSON_VALUE, json.getBytes());
    }
}
