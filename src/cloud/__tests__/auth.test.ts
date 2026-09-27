import { mapRequestError } from '../auth';

describe('sending a sign-in code: server refusals are mapped honestly (P2B)', () => {
  it('a refused address is never reported as a wrong code', () => {
    expect(mapRequestError('Email address "x@y.test" is invalid', 400)).toEqual({
      ok: false,
      reason: 'email_rejected',
    });
    expect(mapRequestError('Email address not authorized', 400).ok).toBe(false);
    expect(mapRequestError('Email address not authorized', 400)).toMatchObject({
      reason: 'email_rejected',
    });
  });

  it('rate limits and network failures keep their meaning', () => {
    expect(mapRequestError('email rate limit exceeded', 429)).toMatchObject({
      reason: 'rate_limited',
    });
    expect(mapRequestError('Failed to fetch')).toMatchObject({ reason: 'network' });
    expect(mapRequestError('something else', 500)).toMatchObject({ reason: 'unknown' });
  });
});
