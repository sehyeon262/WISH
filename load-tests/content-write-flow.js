import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'https://api-dev.wish-e103.xyz/api/v1').replace(/\/$/, '');
const EMAIL_PREFIX = __ENV.EMAIL_PREFIX || 'loadtest';
const EMAIL_DOMAIN = __ENV.EMAIL_DOMAIN || 'comong.test';
const PASSWORD = __ENV.PASSWORD || 'Test1234!';
const USER_COUNT = Number(__ENV.USER_COUNT || '30');

const MUSIC_CHART_ID = __ENV.MUSIC_CHART_ID || __ENV.CHART_ID || 'canon';
const MUSIC_TOTAL_NOTES = Number(__ENV.MUSIC_TOTAL_NOTES || '174');
const MUSIC_DURATION_MS = Number(__ENV.MUSIC_DURATION_MS || '50000');
const EXERCISE_TYPE = __ENV.EXERCISE_TYPE || 'TOP';
const POOMSAE = __ENV.POOMSAE || 'TAEGEUK_1';
const INCLUDE_READ_BACK = String(__ENV.INCLUDE_READ_BACK || 'true').toLowerCase() !== 'false';

export const options = {
  scenarios: {
    content_write_flow: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || '1'),
      duration: __ENV.DURATION || '1m',
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

function requestOptions(token, name) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    tags: { name },
  };
}

function jsonOptions(name) {
  return {
    headers: { 'Content-Type': 'application/json' },
    tags: { name },
  };
}

function testEmail(index) {
  return `${EMAIL_PREFIX}${String(index).padStart(2, '0')}@${EMAIL_DOMAIN}`;
}

function jsonPath(response, path) {
  try {
    return response.json(path);
  } catch (_) {
    return undefined;
  }
}

function requireOk(response, name, extraChecks = {}) {
  const passed = check(response, {
    [`${name}: status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    ...extraChecks,
  });

  if (!passed) {
    console.error(`${name} failed: status=${response.status}, body=${response.body}`);
  }

  return passed;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAccuracy() {
  return Number((0.75 + Math.random() * 0.24).toFixed(3));
}

function firstDataId(response) {
  const data = jsonPath(response, 'data');
  return Array.isArray(data) && data.length > 0 ? data[0].id : null;
}

function prepareUser(index) {
  const login = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: testEmail(index),
      password: PASSWORD,
    }),
    jsonOptions('/auth/login'),
  );

  const loginOk = requireOk(login, `setup login ${index}`, {
    [`setup login ${index}: access token exists`]: (r) => Boolean(jsonPath(r, 'data.accessToken')),
  });

  if (!loginOk) {
    return null;
  }

  const token = jsonPath(login, 'data.accessToken');
  const profiles = http.get(`${BASE_URL}/patient-profiles`, requestOptions(token, '/patient-profiles'));

  const profileOk = requireOk(profiles, `setup patient profiles ${index}`, {
    [`setup patient profiles ${index}: at least one profile exists`]: (r) => {
      const data = jsonPath(r, 'data');
      return Array.isArray(data) && data.length > 0 && Boolean(data[0].id);
    },
  });

  if (!profileOk) {
    return null;
  }

  return {
    email: testEmail(index),
    token,
    patientProfileId: jsonPath(profiles, 'data.0.id'),
  };
}

function loadMotionIds(token) {
  let exerciseMotionId = Number(__ENV.EXERCISE_MOTION_ID || '0');
  let taekwondoMotionId = Number(__ENV.TAEKWONDO_MOTION_ID || '0');

  if (!exerciseMotionId) {
    const exerciseMotions = http.get(
      `${BASE_URL}/exercise-motions?exerciseType=${encodeURIComponent(EXERCISE_TYPE)}`,
      requestOptions(token, '/exercise-motions'),
    );
    requireOk(exerciseMotions, 'setup exercise motions', {
      'setup exercise motions: id exists': (r) => Boolean(firstDataId(r)),
    });
    exerciseMotionId = firstDataId(exerciseMotions);
  }

  if (!taekwondoMotionId) {
    const taekwondoMotions = http.get(
      `${BASE_URL}/taekwondo-motions?poomsae=${encodeURIComponent(POOMSAE)}`,
      requestOptions(token, '/taekwondo-motions'),
    );
    requireOk(taekwondoMotions, 'setup taekwondo motions', {
      'setup taekwondo motions: id exists': (r) => Boolean(firstDataId(r)),
    });
    taekwondoMotionId = firstDataId(taekwondoMotions);
  }

  if (!exerciseMotionId || !taekwondoMotionId) {
    throw new Error('Could not prepare motion IDs. Check EXERCISE_TYPE, POOMSAE, or explicit motion ID envs.');
  }

  return { exerciseMotionId, taekwondoMotionId };
}

function buildMusicPayload() {
  const missCount = randomInt(0, Math.max(0, Math.floor(MUSIC_TOTAL_NOTES * 0.05)));
  const goodCount = randomInt(0, Math.max(1, Math.floor(MUSIC_TOTAL_NOTES * 0.12)));
  const greatCount = randomInt(0, Math.max(1, Math.floor(MUSIC_TOTAL_NOTES * 0.2)));
  const perfectCount = MUSIC_TOTAL_NOTES - missCount - goodCount - greatCount;
  const maxCombo = randomInt(
    Math.max(1, Math.floor(MUSIC_TOTAL_NOTES * 0.6)),
    Math.max(1, MUSIC_TOTAL_NOTES - missCount),
  );

  return {
    chartId: MUSIC_CHART_ID,
    score: perfectCount * 100 + greatCount * 70 + goodCount * 40,
    maxCombo,
    perfectCount,
    greatCount,
    goodCount,
    missCount,
    totalNotes: MUSIC_TOTAL_NOTES,
    playedDurationMs: MUSIC_DURATION_MS,
  };
}

function buildExerciseMotionPayload(exerciseMotionId) {
  return {
    exerciseMotionId,
    durationSec: randomInt(8, 20),
    accuracy: randomAccuracy(),
    completedReps: randomInt(3, 8),
    feedback: 'load test exercise motion',
  };
}

function buildTaekwondoMotionPayload(taekwondoMotionId) {
  return {
    taekwondoMotionId,
    durationSec: randomInt(8, 20),
    accuracy: randomAccuracy(),
    completedReps: randomInt(1, 3),
    feedback: 'load test taekwondo motion',
    monstersDefeated: randomInt(1, 5),
  };
}

export function setup() {
  const users = [];

  for (let index = 1; index <= USER_COUNT; index += 1) {
    const user = prepareUser(index);
    if (user) {
      users.push(user);
    }
  }

  if (users.length === 0) {
    throw new Error('No load-test users were prepared. Check test account credentials and profiles.');
  }

  return {
    users,
    ...loadMotionIds(users[0].token),
  };
}

export default function (data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const { token, patientProfileId } = user;
  let loginSessionId;

  group('login session', () => {
    const start = http.post(
      `${BASE_URL}/login-sessions`,
      JSON.stringify({ patientProfileId }),
      requestOptions(token, '/login-sessions'),
    );
    requireOk(start, 'login session start', {
      'login session start: id exists': (r) => Boolean(jsonPath(r, 'data.id')),
    });

    loginSessionId = jsonPath(start, 'data.id');
  });

  group('music result', () => {
    const create = http.post(
      `${BASE_URL}/music/results`,
      JSON.stringify(buildMusicPayload()),
      requestOptions(token, '/music/results'),
    );
    requireOk(create, 'music result create', {
      'music result create: id exists': (r) => Boolean(jsonPath(r, 'data.id')),
    });

    const resultId = jsonPath(create, 'data.id');

    if (INCLUDE_READ_BACK && resultId) {
      const detail = http.get(
        `${BASE_URL}/music/results/${resultId}`,
        requestOptions(token, '/music/results/{id}'),
      );
      requireOk(detail, 'music result detail');

      const mine = http.get(
        `${BASE_URL}/music/results/me?page=0&size=10`,
        requestOptions(token, '/music/results/me'),
      );
      requireOk(mine, 'music results me');

      const best = http.get(
        `${BASE_URL}/music/results/me/best`,
        requestOptions(token, '/music/results/me/best'),
      );
      requireOk(best, 'music results best');

      const ranking = http.get(
        `${BASE_URL}/music/charts/${encodeURIComponent(MUSIC_CHART_ID)}/ranking?limit=10`,
        requestOptions(token, '/music/charts/{chartId}/ranking'),
      );
      requireOk(ranking, 'music chart ranking');
    }
  });

  group('exercise result', () => {
    const create = http.post(
      `${BASE_URL}/exercise-sessions`,
      JSON.stringify({ patientProfileId, exerciseType: EXERCISE_TYPE }),
      requestOptions(token, '/exercise-sessions'),
    );
    requireOk(create, 'exercise session create', {
      'exercise session create: id exists': (r) => Boolean(jsonPath(r, 'data.id')),
    });

    const sessionId = jsonPath(create, 'data.id');

    if (!sessionId) {
      return;
    }

    const saveMotion = http.post(
      `${BASE_URL}/exercise-sessions/${sessionId}/motions`,
      JSON.stringify(buildExerciseMotionPayload(data.exerciseMotionId)),
      requestOptions(token, '/exercise-sessions/{id}/motions'),
    );
    requireOk(saveMotion, 'exercise motion save', {
      'exercise motion save: saved motion id exists': (r) => Boolean(jsonPath(r, 'data.savedMotion.id')),
    });

    if (INCLUDE_READ_BACK) {
      const detail = http.get(
        `${BASE_URL}/exercise-sessions/${sessionId}`,
        requestOptions(token, '/exercise-sessions/{id}'),
      );
      requireOk(detail, 'exercise session detail');

      const list = http.get(
        `${BASE_URL}/exercise-sessions?patientProfileId=${patientProfileId}`,
        requestOptions(token, '/exercise-sessions'),
      );
      requireOk(list, 'exercise session list');
    }
  });

  group('taekwondo result', () => {
    const create = http.post(
      `${BASE_URL}/taekwondo-sessions`,
      JSON.stringify({ patientProfileId, poomsae: POOMSAE }),
      requestOptions(token, '/taekwondo-sessions'),
    );
    requireOk(create, 'taekwondo session create', {
      'taekwondo session create: id exists': (r) => Boolean(jsonPath(r, 'data.id')),
    });

    const sessionId = jsonPath(create, 'data.id');

    if (!sessionId) {
      return;
    }

    const saveMotion = http.post(
      `${BASE_URL}/taekwondo-sessions/${sessionId}/motions`,
      JSON.stringify(buildTaekwondoMotionPayload(data.taekwondoMotionId)),
      requestOptions(token, '/taekwondo-sessions/{id}/motions'),
    );
    requireOk(saveMotion, 'taekwondo motion save', {
      'taekwondo motion save: saved motion id exists': (r) => Boolean(jsonPath(r, 'data.savedMotion.id')),
    });

    if (INCLUDE_READ_BACK) {
      const detail = http.get(
        `${BASE_URL}/taekwondo-sessions/${sessionId}`,
        requestOptions(token, '/taekwondo-sessions/{id}'),
      );
      requireOk(detail, 'taekwondo session detail');

      const list = http.get(
        `${BASE_URL}/taekwondo-sessions?patientProfileId=${patientProfileId}`,
        requestOptions(token, '/taekwondo-sessions'),
      );
      requireOk(list, 'taekwondo session list');
    }
  });

  if (loginSessionId) {
    group('login session end', () => {
      const end = http.patch(
        `${BASE_URL}/login-sessions/${loginSessionId}/end`,
        null,
        requestOptions(token, '/login-sessions/{id}/end'),
      );
      requireOk(end, 'login session end');
    });
  }

  sleep(Number(__ENV.SLEEP_SECONDS || '1'));
}
