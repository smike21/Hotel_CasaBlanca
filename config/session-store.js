const session = require('express-session');
const { sql, getPool } = require('./db');

class SqlSessionStore extends session.Store {
  get(sid, callback) {
    getPool()
      .then((pool) => pool.request().input('sid', sql.VarChar(128), sid).query('SELECT data FROM SesionesWeb WHERE sid = @sid AND expira_en > SYSUTCDATETIME()'))
      .then((result) => callback(null, result.recordset.length ? JSON.parse(result.recordset[0].data) : null))
      .catch(callback);
  }

  set(sid, sessionData, callback) {
    const expiresAt = new Date(Date.now() + (sessionData.cookie?.maxAge || 1000 * 60 * 60 * 4));
    getPool()
      .then((pool) => pool.request()
        .input('sid', sql.VarChar(128), sid)
        .input('data', sql.NVarChar(sql.MAX), JSON.stringify(sessionData))
        .input('expira_en', sql.DateTime2, expiresAt)
        .query(`MERGE SesionesWeb AS target USING (SELECT @sid AS sid) AS source ON target.sid = source.sid
          WHEN MATCHED THEN UPDATE SET data = @data, expira_en = @expira_en
          WHEN NOT MATCHED THEN INSERT (sid, data, expira_en) VALUES (@sid, @data, @expira_en);`))
      .then(() => callback?.(null))
      .catch((err) => callback?.(err));
  }

  destroy(sid, callback) {
    getPool().then((pool) => pool.request().input('sid', sql.VarChar(128), sid).query('DELETE FROM SesionesWeb WHERE sid = @sid'))
      .then(() => callback?.(null)).catch((err) => callback?.(err));
  }

  touch(sid, sessionData, callback) {
    const expiresAt = new Date(Date.now() + (sessionData.cookie?.maxAge || 1000 * 60 * 60 * 4));
    getPool().then((pool) => pool.request().input('sid', sql.VarChar(128), sid).input('expira_en', sql.DateTime2, expiresAt)
      .query('UPDATE SesionesWeb SET expira_en = @expira_en WHERE sid = @sid'))
      .then(() => callback?.(null)).catch((err) => callback?.(err));
  }
}

module.exports = SqlSessionStore;
