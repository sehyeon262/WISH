import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'https://api-dev.wish-e103.xyz/api/v1').replace(/\/$/, '');
const EMAIL_PREFIX = __ENV.EMAIL_PREFIX || 'loadtest';
const EMAIL_DOMAIN = __ENV.EMAIL_DOMAIN || 'comong.test';
const PASSWORD = __ENV.PASSWORD || 'Test1234!';
const USER_COUNT = Number(__ENV.USER_COUNT || '30');

export const options = {
  scenarios: {
    user_flow_no_login: {
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
    [`setup login ${index}: access token exists`]: (r) => Boolean(r.json('data.accessToken')),
  });

  if (!loginOk) {
    return null;
  }

  const token = login.json('data.accessToken');
  const profiles = http.get(`${BASE_URL}/patient-profiles`, requestOptions(token, '/patient-profiles'));

  const profileOk = requireOk(profiles, `setup patient profiles ${index}`, {
    [`setup patient profiles ${index}: at least one profile exists`]: (r) => {
      const data = r.json('data');
      return Array.isArray(data) && data.length > 0 && Boolean(data[0].id);
    },
  });

  if (!profileOk) {
    return null;
  }

  const data = profiles.json('data');
  return {
    email: testEmail(index),
    token,
    patientProfileId: data[0].id,
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

  return { users };
}

export default function (data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const { token, patientProfileId } = user;
  let loginSessionId;

  group('user and patient profile', () => {
    const me = http.get(`${BASE_URL}/users/me`, requestOptions(token, '/users/me'));
    requireOk(me, 'users me');

    const profiles = http.get(
      `${BASE_URL}/patient-profiles`,
      requestOptions(token, '/patient-profiles'),
    );
    requireOk(profiles, 'patient profiles');
  });

  group('login session', () => {
    const start = http.post(
      `${BASE_URL}/login-sessions`,
      JSON.stringify({ patientProfileId }),
      requestOptions(token, '/login-sessions'),
    );
    requireOk(start, 'login session start', {
      'login session start: id exists': (r) => Boolean(r.json('data.id')),
    });

    loginSessionId = start.json('data.id');

    if (!loginSessionId) {
      return;
    }

    sleep(1);

    const heartbeat = http.patch(
      `${BASE_URL}/login-sessions/${loginSessionId}/heartbeat`,
      null,
      requestOptions(token, '/login-sessions/{id}/heartbeat'),
    );
    requireOk(heartbeat, 'login session heartbeat');
  });

  group('usage stats', () => {
    const daily = http.get(
      `${BASE_URL}/patients/${patientProfileId}/usage-stats/daily`,
      requestOptions(token, '/patients/{patientId}/usage-stats/daily'),
    );
    requireOk(daily, 'daily usage stats');

    const cumulative = http.get(
      `${BASE_URL}/patients/${patientProfileId}/usage-stats/cumulative`,
      requestOptions(token, '/patients/{patientId}/usage-stats/cumulative'),
    );
    requireOk(cumulative, 'cumulative usage stats');

    const averages = http.get(
      `${BASE_URL}/usage-stats/period-averages`,
      requestOptions(token, '/usage-stats/period-averages'),
    );
    requireOk(averages, 'period averages');

    const rankings = http.get(
      `${BASE_URL}/usage-stats/period-rankings`,
      requestOptions(token, '/usage-stats/period-rankings'),
    );
    requireOk(rankings, 'period rankings');
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
