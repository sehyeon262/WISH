FROM gradle:9.4.1-jdk21 AS builder

WORKDIR /workspace

COPY . .

RUN chmod +x ./gradlew

RUN ./gradlew bootJar -x test --no-daemon

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY --from=builder /workspace/build/libs/ /tmp/libs/

RUN set -eux; \
    jars="$(find /tmp/libs -maxdepth 1 -type f -name '*.jar' ! -name '*-plain.jar')"; \
    count="$(printf '%s\n' "$jars" | sed '/^$/d' | wc -l)"; \
    [ "$count" -eq 1 ]; \
    cp "$jars" /app/app.jar; \
    rm -rf /tmp/libs

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
