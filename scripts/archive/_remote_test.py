import requests

API_KEY = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1"

SYSTEM = (
    "\u4f60\u662f\u9f9a\u9053\u519b\uff0c\u670b\u53cb\u9047\u5230\u70e6\u607c\u6765\u627e\u4f60\u3002"
    "\u8bf4\u8bdd\u98ce\u683c\uff1a\u6bcf\u6b21\u56de\u590d 1-3 \u53e5\uff0c\u6bcf\u53e5\u4e0d\u8d85\u8fc7 15 \u5b57\uff0c"
    "\u53cd\u95ee\u6216\u91cd\u6784\u6846\u67b6\uff0c\u4e0d\u5b89\u6170\uff0c\u4e0d\u8bf4\u6559\uff0c\u770b\u7a7f\u672c\u8d28\uff0c\u5076\u5c14\u5e7d\u9ed8\u3002"
    "\u4e25\u683c\u6a21\u4eff\uff1a\n"
    "\u95ee\uff1a\u8d37\u6b3e\u6295\u8d44\u597d\u4e0d\u597d \u2192 \u8d37\u6b3e\u6295\u8d44\u90a3\u5c31\u662f\u98ceddouble\u3002\u672c\u8d28\u662f\u7ed9\u9280\u884c\u6253\u5de5\u548c\u6297\u98ce\u9669\u3002\n"
    "\u95ee\uff1a\u4e70\u4e1c\u897f\u8d35\u4e0d\u5024 \u2192 \u4e0d\u662f\u8d35\u4e0d\u8d35\u7684\u95ee\u9898\u3002\u662f\u6709\u65e0\u5fc5\u8981\u7684\u95ee\u9898\u3002"
)

TESTS = [
    "\u9280\u884c\u7ed9\u6211\u653e\u4e861000\u4e07\uff0c\u5229\u73872.4\uff0c\u6211\u60f3\u62ff\u53bb\u505a\u6295\u8d44",
    "\u6211\u6700\u8fd1\u5f88\u7126\u8651\uff0c\u611f\u89c9\u4ec0\u4e48\u90fd\u6ca1\u505a\u597d",
    "\u4e70\u4e86\u5f88\u591a\u8bfe\u7a0b\u4f46\u90fd\u6ca1\u5b66\u5b8c\uff0c\u6d6a\u8d39\u4e86\u597d\u591a\u9322",
]

for model in ["mimo-v2-omni", "mimo-v2-pro"]:
    print(f"\n{'='*50}")
    print(f"MODEL: {model}")
    print("=" * 50)
    for q in TESTS:
        r = requests.post(
            f"{BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": q},
                ],
                "max_tokens": 500,
                "temperature": 0.75,
            },
            timeout=25,
        )
        data = r.json()
        choices = data.get("choices", [])
        if choices:
            content = choices[0]["message"].get("content", "")
            usage = data.get("usage", {})
            reasoning = usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0)
            total = usage.get("completion_tokens", 0)
            print(f"\nQ: {q}")
            print(f"A: {content}")
            print(f"   (total={total}, reasoning={reasoning}, answer={total - reasoning})")
        else:
            print(f"Q: {q} => ERROR: {data}")
