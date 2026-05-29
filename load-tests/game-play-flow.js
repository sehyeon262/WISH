import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'https://api-dev.wish-e103.xyz/api/v1').replace(/\/$/, '');
const EMAIL_PREFIX = __ENV.EMAIL_PREFIX || 'loadtest';
const EMAIL_DOMAIN = __ENV.EMAIL_DOMAIN || 'comong.test';
const PASSWORD = __ENV.PASSWORD || 'Test1234!';
const USER_COUNT = Number(__ENV.USER_COUNT || '30');

const EXERCISE_TYPE = __ENV.EXERCISE_TYPE || 'TOP';
const POOMSAE = __ENV.POOMSAE || 'TAEGEUK_1';
const PLAY_MODE = (__ENV.PLAY_MODE || 'both').toLowerCase();
const INCLUDE_READ_BACK = String(__ENV.INCLUDE_READ_BACK || 'false').toLowerCase() === 'true';
const CONTENT_EVENTS = String(__ENV.CONTENT_EVENTS || 'true').toLowerCase() !== 'false';
const RATE = Number(__ENV.RATE || __ENV.ARRIVAL_RATE || '1');
const TIME_UNIT = __ENV.TIME_UNIT || '1s';
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || __ENV.VUS || String(Math.max(RATE, 1)));
const MAX_VUS = Number(__ENV.MAX_VUS || String(Math.max(PRE_ALLOCATED_VUS * 2, RATE * 4, 10)));

export const options = {
  scenarios: {
    game_play_flow: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: TIME_UNIT,
      duration: __ENV.DURATION || '1m',
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

function jsonOptions(name) {
  return {
    headers: { 'Content-Type': 'application/json' },
    tags: { name },
  };
}

function requestOptions(token, name) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
  return Number((0.76 + Math.random() * 0.23).toFixed(3));
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

  if (!exerciseMotionId && shouldRunExercise()) {
    const exerciseMotions = http.get(
      `${BASE_URL}/exercise-motions?exerciseType=${encodeURIComponent(EXERCISE_TYPE)}`,
      requestOptions(token, '/exercise-motions'),
    );
    requireOk(exerciseMotions, 'setup exercise motions', {
      'setup exercise motions: id exists': (r) => Boolean(firstDataId(r)),
    });
    exerciseMotionId = firstDataId(exerciseMotions);
  }

  if (!taekwondoMotionId && shouldRunTaekwondo()) {
    const taekwondoMotions = http.get(
      `${BASE_URL}/taekwondo-motions?poomsae=${encodeURIComponent(POOMSAE)}`,
      requestOptions(token, '/taekwondo-motions'),
    );
    requireOk(taekwondoMotions, 'setup taekwondo motions', {
      'setup taekwondo motions: id exists': (r) => Boolean(firstDataId(r)),
    });
    taekwondoMotionId = firstDataId(taekwondoMotions);
  }

  if (shouldRunExercise() && !exerciseMotionId) {
    throw new Error('Could not prepare exercise motion ID. Check EXERCISE_TYPE or EXERCISE_MOTION_ID.');
  }

  if (shouldRunTaekwondo() && !taekwondoMotionId) {
    throw new Error('Could not prepare taekwondo motion ID. Check POOMSAE or TAEKWONDO_MOTION_ID.');
  }

  return { exerciseMotionId, taekwondoMotionId };
}

function shouldRunExercise() {
  return PLAY_MODE === 'both' || PLAY_MODE === 'exercise' || PLAY_MODE === 'gymnastics';
}

function shouldRunTaekwondo() {
  return PLAY_MODE === 'both' || PLAY_MODE === 'taekwondo';
}

function buildExerciseMotionPayload(exerciseMotionId) {
  return {
    exerciseMotionId,
    durationSec: randomInt(10, 25),
    accuracy: randomAccuracy(),
    completedReps: randomInt(3, 8),
    feedback: 'load test game exercise motion',
  };
}

function buildTaekwondoMotionPayload(taekwondoMotionId) {
  return {
    taekwondoMotionId,
    durationSec: randomInt(10, 25),
    accuracy: randomAccuracy(),
    completedReps: randomInt(1, 3),
    feedback: 'load test game taekwondo motion',
    monstersDefeated: randomInt(1, 5),
  };
}

function startContent(token, loginSessionId, contentType) {
  if (!CONTENT_EVENTS || !loginSessionId) {
    return;
  }

  const response = http.post(
    `${BASE_URL}/realtime/login-sessions/${loginSessionId}/content/start`,
    JSON.stringify({ contentType }),
    requestOptions(token, '/realtime/login-sessions/{id}/content/start'),
  );
  requireOk(response, `${contentType.toLowerCase()} content start`);
}

function endContent(token, loginSessionId, contentType) {
  if (!CONTENT_EVENTS || !loginSessionId) {
    return;
  }

  const response = http.post(
    `${BASE_URL}/realtime/login-sessions/${loginSessionId}/content/end`,
    null,
    requestOptions(token, '/realtime/login-sessions/{id}/content/end'),
  );
  requireOk(response, `${contentType.toLowerCase()} content end`);
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

function runExerciseFlow(token, patientProfileId, loginSessionId, exerciseMotionId) {
  group('gymnastics play', () => {
    startContent(token, loginSessionId, 'GYMNASTICS');

    const create = http.post(
      `${BASE_URL}/exercise-sessions`,
      JSON.stringify({ patientProfileId, exerciseType: EXERCISE_TYPE }),
      requestOptions(token, '/exercise-sessions'),
    );
    requireOk(create, 'exercise session create', {
      'exercise session create: id exists': (r) => Boolean(jsonPath(r, 'data.id')),
    });

    const sessionId = jsonPath(create, 'data.id');

    if (sessionId) {
      const saveMotion = http.post(
        `${BASE_URL}/exercise-sessions/${sessionId}/motions`,
        JSON.stringify(buildExerciseMotionPayload(exerciseMotionId)),
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
      }
    }

    endContent(token, loginSessionId, 'GYMNASTICS');
  });
}

function runTaekwondoFlow(token, patientProfileId, loginSessionId, taekwondoMotionId) {
  group('taekwondo play', () => {
    startContent(token, loginSessionId, 'TAEKWONDO');

    const create = http.post(
      `${BASE_URL}/taekwondo-sessions`,
      JSON.stringify({ patientProfileId, poomsae: POOMSAE }),
      requestOptions(token, '/taekwondo-sessions'),
    );
    requireOk(create, 'taekwondo session create', {
      'taekwondo session create: id exists': (r) => Boolean(jsonPath(r, 'data.id')),
    });

    const sessionId = jsonPath(create, 'data.id');

    if (sessionId) {
      const saveMotion = http.post(
        `${BASE_URL}/taekwondo-sessions/${sessionId}/motions`,
        JSON.stringify(buildTaekwondoMotionPayload(taekwondoMotionId)),
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
      }
    }

    endContent(token, loginSessionId, 'TAEKWONDO');
  });
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

  if (shouldRunExercise()) {
    runExerciseFlow(token, patientProfileId, loginSessionId, data.exerciseMotionId);
  }

  if (shouldRunTaekwondo()) {
    runTaekwondoFlow(token, patientProfileId, loginSessionId, data.taekwondoMotionId);
  }

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

  sleep(Number(__ENV.SLEEP_SECONDS || '0'));
}
