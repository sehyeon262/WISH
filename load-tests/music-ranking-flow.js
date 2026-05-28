import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'https://api-dev.wish-e103.xyz/api/v1').replace(/\/$/, '');
const EMAIL_PREFIX = __ENV.EMAIL_PREFIX || 'loadtest';
const EMAIL_DOMAIN = __ENV.EMAIL_DOMAIN || 'comong.test';
const PASSWORD = __ENV.PASSWORD || 'Test1234!';
const USER_COUNT = Number(__ENV.USER_COUNT || '30');
const CHART_ID = __ENV.CHART_ID || __ENV.MUSIC_CHART_ID || 'canon';
const LIMIT = Number(__ENV.LIMIT || '10');

export const options = {
  scenarios: {
    music_ranking_flow: {
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

  return {
    email: testEmail(index),
    token: jsonPath(login, 'data.accessToken'),
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
    throw new Error('No load-test users were prepared. Check test account credentials.');
  }

  return { users };
}

export default function (data) {
  const user = data.users[(__VU - 1) % data.users.length];

  const ranking = http.get(
    `${BASE_URL}/music/charts/${encodeURIComponent(CHART_ID)}/ranking?limit=${LIMIT}`,
    requestOptions(user.token, '/music/charts/{chartId}/ranking'),
  );

  requireOk(ranking, 'music chart ranking', {
    'music chart ranking: chart id matches': (r) => jsonPath(r, 'data.chartId') === CHART_ID,
    'music chart ranking: entries exists': (r) => Array.isArray(jsonPath(r, 'data.entries')),
  });

  sleep(Number(__ENV.SLEEP_SECONDS || '1'));
}
