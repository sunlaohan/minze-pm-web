# Social SVG provenance

Solid, monochrome paths selected from iconfont public search previews:

| File | Platform | iconfont icon ID | Source |
| --- | --- | --- | --- |
| `wechat.svg` | 微信 / WeChat | 77156 | https://www.iconfont.cn/search/index?searchType=icon&q=微信 |
| `xiaohongshu.svg` | 小红书 / Xiaohongshu | 40336764 | https://www.iconfont.cn/search/index?searchType=icon&q=小红书 |
| `douyin.svg` | 抖音 / Douyin | 18166694 | https://www.iconfont.cn/search/index?searchType=icon&q=抖音 |
| `bilibili.svg` | 哔哩哔哩 / Bilibili | 25039620 | https://www.iconfont.cn/search/index?searchType=icon&q=哔哩哔哩 |

The original path geometry is retained. Fixed colors and iconfont preview attributes were removed so the symbols inherit `currentColor`. All four use filled paths, without stroked outlines. Rights to the uploaded artwork and platform marks remain with their respective owners; no open-source license is asserted.

`scripts/social_icons.py` generates the local renderer modules from these SVGs and keeps the captured icon module names as compatibility aliases. The same four symbols appear on Home, About, and every page footer. Unrelated template account links are removed; real platform account URLs can be added later.

The renderer applies individual optical scale and centering adjustments inside the original square slots: WeChat 106%, Xiaohongshu 100%, Douyin 85%, and Bilibili 112%. This balances their different silhouettes without changing the row spacing or path geometry.
