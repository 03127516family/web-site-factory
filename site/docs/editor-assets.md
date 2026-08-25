# 编辑器资源配置

图片地址分为站点配置和模板合同两层。

## 站点配置

编辑服务和 Astro 构建读取以下环境变量：

```dotenv
# 默认 public/assets/img
ASSET_DISK_ROOT=public/assets/img

# 默认 /assets/img；也可以是 https://cdn.example.com/assets/img
ASSET_PUBLIC_BASE=/assets/img
```

JSON 不保存域名。更换域名、静态目录或 CDN 时修改这里，不修改公共编辑器。

## 模板合同

每个 `edit-contract.json` 必须声明：

```json
{
  "assets": {
    "namespace": "product",
    "valueFormat": "filename"
  }
}
```

- `namespace`：站点资源根目录下的子目录，例如 `product` 或 `post`。
- `valueFormat: "filename"`：JSON 保存文件名，适合模板统一拼接资源基址。
- `valueFormat: "publicPath"`：JSON 保存公共路径，适合已有文章内容。

上传端点根据当前页面的模板合同决定目录和保存格式，浏览器不能自行指定磁盘位置。
