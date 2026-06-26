# ZenTalk · 禅语问答

一个禅宗风格的对话 AI，用简短有力的比喻和反问，帮你拨开烦恼的迷雾。

**Live:** https://zen.mplusm.site

## 技术栈

- **Frontend:** React + Vite，现代深色简洁 UI
- **Backend:** Python FastAPI，多轮对话支持
- **LLM:** 小米 Mimo（OpenAI 兼容接口）
- **Deploy:** 腾讯云 CVM + aaPanel + PM2 + Let's Encrypt SSL

## 本地开发

```bash
# 后端
cd backend
pip install -r requirements.txt
XIAOMI_API_KEY=your-key uvicorn main:app --reload

# 前端
cd frontend
npm install
npm run dev
```

## 重新部署

```bash
pip install paramiko requests
python3 scripts/deploy_remote.py
```

## 项目结构

```
├── backend/          # FastAPI 后端
│   ├── main.py       # API + 禅宗 Prompt + 多轮对话
│   └── requirements.txt
├── frontend/         # React 前端
│   └── src/
│       ├── App.jsx
│       └── components/ChatWindow.jsx
├── nginx/            # Nginx vhost 配置
├── scripts/
│   ├── deploy_remote.py  # 一键部署脚本
│   └── dns_setup.py      # 腾讯云 DNS 配置
└── docker-compose.yml
```
