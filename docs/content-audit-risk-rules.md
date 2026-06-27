# Content Audit Risk Rewrite Notes

Date: 2026-06-23

## Evidence

- Current desktop visible failure is not a content audit hit. The page shows `HTTP 502: Bad gateway` from Cloudflare for the 9:16 cat prompt.
- Current desktop logs did not contain a confirmed `content_policy_violation` or `moderation_blocked` failure for the latest tests.
- The local client maps real upstream audit failures through the error codes `moderation_blocked` and `content_policy_violation`.

## Most Likely Risk Source

If the reported audit warning refers to the Spring Festival building edit prompt, the highest-risk phrases are:

- `烟花光影`
- `远处夜空绽放少量烟花`

Why: these words can be interpreted by upstream safety classifiers as pyrotechnics / explosion-like imagery, even when the creative intent is a harmless holiday scene.

A secondary risk pattern is:

- `严格原样执行以下全部指令，禁止改写、增删任何文字`

Why: this can prevent the upstream model from safely adapting ambiguous wording. Use it only when exact prompt preservation is more important than safety adaptation.

## Safer Rewrite

将这张现代玻璃摩天楼建筑效果图修改为春节夜景：保留原有未来感玻璃摩天楼造型、构图、城市公园、人群、步道和街道环境不变。天空改为深蓝色节庆夜空，建筑内部灯光与轮廓灯全部亮起，玻璃幕墙反射城市夜景、彩灯、灯笼和柔和的节庆灯光秀；底层商业空间散发温暖金色灯光，入口与街道两侧悬挂红灯笼、中国结、春联和节庆灯饰，公园步道布置春节彩灯、花灯与红色装饰，人群在步道上赏灯、拍照、散步，局部可见喜庆的春节市集摊位和节日氛围；远处夜空呈现星点状灯光、无人机编队光效和柔和光束，灯光映照在玻璃立面和景观植被上，整体呈现高端未来感与中国春节喜庆气氛融合的都市夜晚场景，画面真实、清晰、细节丰富。

## Reusable Rules

1. Replace `烟花`, `绽放`, `爆开`, `火光`, `烟雾` with `节庆灯光秀`, `星点状灯光`, `无人机编队光效`, `柔和光束`, `彩灯倒影`.
2. Prefer describing the final visual effect, not the ignition or combustion process.
3. Avoid naming copyrighted characters, brands, public figures, political symbols, weapons, blood, injuries, NSFW terms, or dangerous objects unless the use case truly requires them.
4. For sensitive or ambiguous prompts, remove `禁止改写` and allow: `如有安全歧义，请在保持创意意图的前提下改写为合规视觉表达`.
5. Put ratio and size in parameters first. In prompt text, use `竖幅构图，9:16` only as a reinforcing hint.
