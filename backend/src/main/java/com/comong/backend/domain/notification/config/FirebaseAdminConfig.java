package com.comong.backend.domain.notification.config;

import java.io.ByteArrayInputStream;
import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.comong.backend.domain.notification.service.FirebaseAdminPushSender;
import com.comong.backend.domain.notification.service.FirebasePushSender;
import com.comong.backend.domain.notification.service.NoopFirebasePushSender;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

@Configuration
@EnableConfigurationProperties(FirebaseProperties.class)
public class FirebaseAdminConfig {

    private static final String FIREBASE_APP_NAME = "comong-fcm";
    private static final Object FIREBASE_APP_LOCK = new Object();

    @Bean
    @ConditionalOnProperty(prefix = "firebase.push", name = "enabled", havingValue = "true")
    public FirebaseApp firebaseApp(FirebaseProperties properties) {
        properties.validateConfigured();
        try (ByteArrayInputStream credentialsStream =
                new ByteArrayInputStream(properties.decodedCredentials())) {
            FirebaseOptions options =
                    FirebaseOptions.builder()
                            .setCredentials(GoogleCredentials.fromStream(credentialsStream))
                            .setProjectId(properties.projectId())
                            .build();
            synchronized (FIREBASE_APP_LOCK) {
                return FirebaseApp.getApps().stream()
                        .filter(app -> FIREBASE_APP_NAME.equals(app.getName()))
                        .findFirst()
                        .orElseGet(() -> FirebaseApp.initializeApp(options, FIREBASE_APP_NAME));
            }
        } catch (IOException e) {
            throw new IllegalStateException("Firebase service account initialization failed", e);
        }
    }

    @Bean
    @ConditionalOnBean(FirebaseApp.class)
    public FirebaseMessaging firebaseMessaging(FirebaseApp firebaseApp) {
        return FirebaseMessaging.getInstance(firebaseApp);
    }

    @Bean
    @ConditionalOnBean(FirebaseMessaging.class)
    public FirebasePushSender firebasePushSender(FirebaseMessaging firebaseMessaging) {
        return new FirebaseAdminPushSender(firebaseMessaging);
    }

    @Bean
    @ConditionalOnMissingBean(FirebasePushSender.class)
    public FirebasePushSender noopFirebasePushSender() {
        return new NoopFirebasePushSender();
    }
}
