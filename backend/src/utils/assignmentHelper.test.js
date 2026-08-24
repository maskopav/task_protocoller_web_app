import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./tokenGenerator.js', () => ({
  generateAccessToken: vi.fn(),
}));

const { generateAccessToken } = await import('./tokenGenerator.js');
const { assignProtocolToParticipant } = await import('./assignmentHelper.js');

const makeConn = ({ projectProtocolRows, tokenCollisionCount = 0 }) => {
  let tokenLookupCalls = 0;
  return {
    query: vi.fn((sql) => {
      if (sql.includes('FROM project_protocols')) {
        return Promise.resolve([projectProtocolRows]);
      }
      if (sql.includes('FROM participant_protocols WHERE access_token')) {
        tokenLookupCalls++;
        // Simulate the first N lookups colliding with an existing token.
        const collides = tokenLookupCalls <= tokenCollisionCount;
        return Promise.resolve([collides ? [{ id: 1 }] : []]);
      }
      if (sql.includes('INSERT INTO participant_protocols')) {
        return Promise.resolve([{ insertId: 42 }]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
};

describe('assignProtocolToParticipant', () => {
  beforeEach(() => {
    generateAccessToken.mockReset();
    generateAccessToken.mockReturnValueOnce('token-1').mockReturnValueOnce('token-2').mockReturnValueOnce('token-3');
  });

  it('throws when the protocol is not assigned to the project', async () => {
    const conn = makeConn({ projectProtocolRows: [] });
    await expect(assignProtocolToParticipant(conn, 1, 1, 1)).rejects.toThrow(
      'Protocol 1 is not assigned to project 1'
    );
  });

  it('inserts the assignment with the first generated token when it is unique', async () => {
    const conn = makeConn({ projectProtocolRows: [{ id: 99 }], tokenCollisionCount: 0 });
    const result = await assignProtocolToParticipant(conn, 5, 7, 1);

    expect(result).toEqual({ participant_protocol_id: 42, unique_token: 'token-1' });
    expect(generateAccessToken).toHaveBeenCalledTimes(1);

    const insertCall = conn.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO'));
    expect(insertCall[1]).toEqual([5, 99, 'token-1']);
  });

  it('regenerates the token until a unique one is found', async () => {
    const conn = makeConn({ projectProtocolRows: [{ id: 99 }], tokenCollisionCount: 2 });
    const result = await assignProtocolToParticipant(conn, 5, 7, 1);

    expect(result.unique_token).toBe('token-3');
    expect(generateAccessToken).toHaveBeenCalledTimes(3);
  });
});
