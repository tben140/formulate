#!/usr/bin/env bash
# Apple Pay payment processing certificate for the app's accelerated
# checkouts (Shopify Checkout Kit). Shopify makes the signing request, Apple
# signs it, Shopify gets the signed certificate back.
# https://shopify.dev/docs/storefronts/mobile/create-apple-payment-processing-certificates
#
# Before running:
#   - The Dev Dashboard app needs write_mobile_payments and read_mobile_payments,
#     which Shopify has to approve first (request form linked from the page above).
#   - An Admin API access token for that app. The script asks for it without
#     echoing; or export SHOPIFY_ADMIN_TOKEN in your own shell. Never paste it
#     anywhere else.
#   - jq, curl and openssl.
#
# Usage, from any folder (files are written to the current one):
#   apple-pay-certificate.sh request          create, wait, save apple_payment_processing.csr
#   apple-pay-certificate.sh csr              save the .csr for the existing certificate,
#                                             if request gave up waiting for it
#   apple-pay-certificate.sh upload FILE.cer  send Apple's signed certificate to Shopify
#   apple-pay-certificate.sh status           show where it's up to
set -euo pipefail

STORE="${SHOPIFY_STORE:-tben140plus-xcorpito.myshopify.com}"
API_VERSION="${SHOPIFY_API_VERSION:-2026-10}"
MERCHANT_ID="${APPLE_MERCHANT_ID:-merchant.com.tben140.doublehelix}"
ID_FILE=".apple-pay-certificate-id"
BASE="https://$STORE/admin/api/$API_VERSION/apple_pay_certificates"

if [ -z "${SHOPIFY_ADMIN_TOKEN:-}" ]; then
  read -rsp "Admin API access token (not shown): " SHOPIFY_ADMIN_TOKEN
  echo
fi

api() { # method path [json]
  curl --silent --show-error --fail-with-body --request "$1" "$BASE$2" \
    --header "X-Shopify-Access-Token: $SHOPIFY_ADMIN_TOKEN" \
    --header "Content-Type: application/json" \
    ${3:+--data "$3"}
}

saved_id() {
  [ -s "$ID_FILE" ] || { echo "No certificate yet: run '$0 request' first." >&2; exit 1; }
  cat "$ID_FILE"
}

save_csr() { # id
  api GET "/$1/csr.json" | tr -d '\n' | jq -r .csr.key \
    | openssl base64 -a -d -out apple_payment_processing.csr
  echo
  echo "Saved apple_payment_processing.csr. Next, in Apple Developer:"
  echo "  Certificates → + → Apple Pay Payment Processing Certificate"
  echo "  (not Merchant Identity) for $MERCHANT_ID, upload the .csr,"
  echo "  download apple_pay.cer, then run: $0 upload apple_pay.cer"
}

case "${1:-}" in
  request)
    id=$(api POST ".json" '{"apple_pay_certificate":{}}' | jq -r '.apple_pay_certificate.id')
    echo "$id" > "$ID_FILE"
    echo "Created certificate $id. Waiting for Shopify's signing request…"
    for _ in $(seq 30); do
      status=$(api GET "/$id.json" | jq -r '.apple_pay_certificate.status')
      [ "$status" = "csr" ] && break
      sleep 2
    done
    # Not 'request' again: that would make a second certificate and lose this id.
    [ "$status" = "csr" ] || { echo "Still '$status' after a minute; run '$0 csr' in a few minutes." >&2; exit 1; }
    save_csr "$id"
    ;;
  csr)
    id=$(saved_id)
    status=$(api GET "/$id.json" | jq -r '.apple_pay_certificate.status')
    [ "$status" = "csr" ] || { echo "Certificate $id is '$status', not ready for its signing request yet." >&2; exit 1; }
    save_csr "$id"
    ;;
  upload)
    cer="${2:?Usage: $0 upload apple_pay.cer}"
    id=$(saved_id)
    encoded=$(openssl base64 -a -A -e -in "$cer")
    body=$(jq -n --arg id "$id" --arg m "$MERCHANT_ID" --arg c "$encoded" \
      '{apple_pay_certificate: {id: $id, status: "completed", merchant_id: $m, encoded_signed_certificate: $c}}')
    api PUT "/$id.json" "$body" | jq '.apple_pay_certificate | {id, status, merchant_id}'
    echo "Done. A first certificate is active straight away; a later one needs Activate in Apple Developer."
    ;;
  status)
    api GET "/$(saved_id).json" | jq '.apple_pay_certificate | {id, status, merchant_id}'
    ;;
  *)
    sed -n '2,22p' "$0"; exit 2 ;;
esac
