#!/usr/bin/env python3
"""
Configure zen.mplusm.site DNS record via Tencent Cloud DNSPod API.
"""
import os
import sys
import json
import hmac
import hashlib
import datetime
import requests

SECRET_ID = os.environ["TENCENT_SECRET_ID"]
SECRET_KEY = os.environ["TENCENT_SECRET_KEY"]
SERVER_IP = os.environ.get("SERVER_IP", "43.133.145.77")
DOMAIN = "mplusm.site"
SUB_DOMAIN = "zen"

def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

def get_signature(secret_key, date, service, string_to_sign):
    secret_date = sign(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = sign(secret_date, service)
    secret_signing = sign(secret_service, "tc3_request")
    return hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

def call_dnspod(action, params):
    service = "dnspod"
    host = "dnspod.tencentcloudapi.com"
    endpoint = f"https://{host}"
    version = "2021-03-23"
    algorithm = "TC3-HMAC-SHA256"
    now = datetime.datetime.utcnow()
    timestamp = str(int(now.timestamp()))
    date = now.strftime("%Y-%m-%d")

    payload = json.dumps(params)
    hashed_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_headers = f"content-type:application/json; charset=utf-8\nhost:{host}\n"
    signed_headers = "content-type;host"
    canonical_request = "\n".join([
        "POST", "/", "",
        canonical_headers, signed_headers, hashed_payload
    ])

    credential_scope = f"{date}/{service}/tc3_request"
    hashed_cr = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = f"{algorithm}\n{timestamp}\n{credential_scope}\n{hashed_cr}"

    signature = get_signature(SECRET_KEY, date, service, string_to_sign)
    auth = (
        f"{algorithm} "
        f"Credential={SECRET_ID}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    headers = {
        "Authorization": auth,
        "Content-Type": "application/json; charset=utf-8",
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Timestamp": timestamp,
        "X-TC-Version": version,
    }

    resp = requests.post(endpoint, headers=headers, data=payload, timeout=15)
    return resp.json()


def ensure_a_record():
    print(f"[DNS] Checking existing records for {SUB_DOMAIN}.{DOMAIN} ...")
    res = call_dnspod("DescribeRecordList", {
        "Domain": DOMAIN,
        "Subdomain": SUB_DOMAIN,
        "RecordType": "A",
    })

    record_list = res.get("Response", {}).get("RecordList", [])
    existing_id = None
    for rec in record_list:
        if rec.get("Name") == SUB_DOMAIN and rec.get("Type") == "A":
            existing_id = rec.get("RecordId")
            current_ip = rec.get("Value")
            print(f"[DNS] Found record ID={existing_id}, IP={current_ip}")
            break

    if existing_id:
        if current_ip == SERVER_IP:
            print(f"[DNS] Record already correct: {SUB_DOMAIN}.{DOMAIN} -> {SERVER_IP}")
            return True
        print(f"[DNS] Updating record to {SERVER_IP} ...")
        res2 = call_dnspod("ModifyRecord", {
            "Domain": DOMAIN,
            "SubDomain": SUB_DOMAIN,
            "RecordType": "A",
            "RecordLine": "默认",
            "Value": SERVER_IP,
            "RecordId": existing_id,
            "TTL": 600,
        })
    else:
        print(f"[DNS] Creating new A record: {SUB_DOMAIN}.{DOMAIN} -> {SERVER_IP} ...")
        res2 = call_dnspod("CreateRecord", {
            "Domain": DOMAIN,
            "SubDomain": SUB_DOMAIN,
            "RecordType": "A",
            "RecordLine": "默认",
            "Value": SERVER_IP,
            "TTL": 600,
        })

    err = res2.get("Response", {}).get("Error")
    if err:
        print(f"[DNS] ERROR: {err}")
        return False
    print(f"[DNS] Success: {SUB_DOMAIN}.{DOMAIN} -> {SERVER_IP}")
    return True


if __name__ == "__main__":
    ok = ensure_a_record()
    sys.exit(0 if ok else 1)
