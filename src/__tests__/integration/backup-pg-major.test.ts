import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const check = (line: string, want = '17') =>
  spawnSync('bash', ['-c', '. scripts/backup/pg-major.sh; require_pg_major "$1" "$2"', '_', line, want], {
    encoding: 'utf8',
  });

describe('require_pg_major', () => {
  it.each(['pg_dump (PostgreSQL) 17.11', 'pg_dump (PostgreSQL) 17.6 (Ubuntu 17.6-1.pgdg24.04+1)'])(
    'accepts %s',
    (line) => expect(check(line).status).toBe(0),
  );

  it.each(['pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15-1.pgdg24.04+2)', 'pg_dump (PostgreSQL) 170.1', '', 'garbage'])(
    'rejects %j with a clear message',
    (line) => {
      const r = check(line);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('pg_dump must be PostgreSQL 17');
    },
  );
});
