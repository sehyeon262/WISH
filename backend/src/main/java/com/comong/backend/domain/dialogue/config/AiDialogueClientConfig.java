package com.comong.backend.domain.dialogue.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(AiDialogueProperties.class)
public class AiDialogueClientConfig {}
