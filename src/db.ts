export interface TrmnlUserData {
  uuid: string | null;
  accessToken: string;
  pluginSettingId: number | null;
}

export class TrmnlUser {
  public readonly uuid: string | null;
  public readonly accessToken: string;
  public readonly pluginSettingId: number | null;

  constructor(data: TrmnlUserData) {
    this.uuid = data.uuid;
    this.accessToken = data.accessToken;
    this.pluginSettingId = data.pluginSettingId;
  }

  static keyOf(uuid: string): string {
    return `trmnl-user/${uuid}`;
  }

  static async findByAccessToken(db: D1Database, accessToken: string): Promise<TrmnlUser | null> {
    const stmt = db.prepare("SELECT * FROM users WHERE access_token = ?").bind(accessToken);
    const row = await stmt.first();
    if (!row) {
      return null;
    }

    return new TrmnlUser({
      uuid: row.uuid as string | null,
      accessToken: row.access_token as string,
      pluginSettingId: row.plugin_setting_id as number | null,
    });
  }

  static async deleteByUuidAndAccessToken(db: D1Database, uuid: string, accessToken: string): Promise<void> {
    const stmt = db.prepare("DELETE FROM users WHERE uuid = ? AND access_token = ?").bind(uuid, accessToken);
    await stmt.run();
  }

  async create(db: D1Database): Promise<void> {
    const stmt = db
      .prepare("INSERT INTO users (uuid, access_token, plugin_setting_id) VALUES (?, ?, ?)")
      .bind(this.uuid, this.accessToken, this.pluginSettingId);
    await stmt.run();
  }

  async setUuidAndPluginSettingId(db: D1Database, uuid: string, pluginSettingId: number): Promise<TrmnlUser> {
    const stmt = db
      .prepare("UPDATE users SET uuid = ?, plugin_setting_id = ? WHERE access_token = ?")
      .bind(uuid, pluginSettingId, this.accessToken);
    await stmt.run();

    return new TrmnlUser({
      uuid,
      accessToken: this.accessToken,
      pluginSettingId,
    });
  }

  async update(db: D1Database): Promise<void> {
    const stmt = db
      .prepare("UPDATE users SET uuid = ?, access_token = ?, plugin_setting_id = ? WHERE uuid = ?")
      .bind(this.uuid, this.accessToken, this.pluginSettingId, this.uuid);
    await stmt.run();
  }
}
