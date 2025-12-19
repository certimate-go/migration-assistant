# Certimate Migaration Assistant

Help you migrate your data from [Certimate](https://github.com/certimate-go/certimate) v0.2.x to v0.4.x. Transfer the "domains" data to the "workflows" data.

---

## Attention

Please note that this is not a regular option for upgrading. It should only be used when you have a large amount of existing data that needs to be migrated. Otherwise, please follow the [documentation](https://docs.certimate.me/en/docs/migrations/), migrate to v0.3.x first, then migrate to v0.4.x.

## Preparation

1. Backup.

2. Run Certimate v0.2.x.

3. Fresh install Certimate v0.4.x (**NOT** upgrade!), and run under a different port.

## Steps

1. Download repo, open `/dist/index.html` in the browser.

2. Connect to the old Certimate service on the webpage.

3. Connect to the new Certimate service on the webpage.

4. Transfer data.

5. Stop the old Certimate service.

---

## 注意事项

请注意，这不是升级的常规方案。仅当你有大量需要迁移的旧数据时才应使用。否则，请按照[文档](https://docs.certimate.me/docs/migrations/)先迁移到 v0.3.x、再迁移到 v0.4.x。

## 准备工作

1. 备份数据。

2. 运行 Certimate v0.2.x。

3. 全新安装 Certimate v0.4.x（注意**不是**升级版本！），然后运行，注意需要与旧版本服务指定为不同的端口。

## 迁移步骤

1. 下载本仓库，在浏览器中打开 `/dist/index.html`。

2. 在网页中连接到旧版本 Certimate 服务。

3. 在网页中连接到新版本 Certimate 服务。

4. 转移数据。

5. 停止旧版本 Certimate 服务。
