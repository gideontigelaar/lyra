#include "api_client.h"
#include "config.h"
#include "logger.h"
#include <HTTPClient.h>
#include <WiFi.h>

#if !__has_include("credentials.h")
#error "include/credentials.h not found, copy it from include/credentials.h.template"
#endif
#include "credentials.h"

void ApiClient::init() {
    _client.useBuiltinCACertBundle();
    _client.setHandshakeTimeout(Config::Network::TIMEOUT_MS / 1000);

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);

    LOG_INFO("Network: Connecting to Wi-Fi (%s)...", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    _last_attempt_ms = millis();
}

void ApiClient::poll(uint32_t now_ms) {
    bool connected = isConnected();

    if (connected && !_was_connected) {
        LOG_INFO("Network: Connected, ip %s, signal %d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    } else if (!connected && _was_connected) {
        LOG_WARN("Network: Wi-Fi connection lost");
        _last_attempt_ms = now_ms;
        _reconnects++;
    }

    _was_connected = connected;

    if (!connected && now_ms - _last_attempt_ms >= Config::Network::WIFI_RETRY_MS) {
        LOG_INFO("Network: Reconnecting to Wi-Fi (%s)...", WIFI_SSID);
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        _last_attempt_ms = now_ms;
    }
}

bool ApiClient::isConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

uint32_t ApiClient::reconnects() const {
    return _reconnects;
}

SendResult ApiClient::get(const char* path, String& response) {
    return request(path, nullptr, response);
}

SendResult ApiClient::post(const char* path, const char* json) {
    String response;
    return request(path, json, response);
}

SendResult ApiClient::request(const char* path, const char* json, String& response) {
    HTTPClient http;
    http.setConnectTimeout(Config::Network::TIMEOUT_MS);
    http.setTimeout(Config::Network::TIMEOUT_MS);
    http.setReuse(false);

    if (!http.begin(_client, String(Config::Network::API_URL) + path)) {
        LOG_ERROR("Network: Invalid API_URL");
        return SendResult::REJECTED;
    }

    http.addHeader("Authorization", "Bearer " API_KEY);
    int status;

    if (json != nullptr) {
        http.addHeader("Content-Type", "application/json");
        status = http.POST(json);
    } else {
        status = http.GET();
    }

    response = status > 0 ? http.getString() : String();
    http.end();

    if (status >= 200 && status < 300) {
        return SendResult::OK;
    }

    if (status < 0) {
        LOG_WARN("Network: Request failed (%s)", HTTPClient::errorToString(status).c_str());
        return SendResult::FAILED;
    }

    if (status >= 500 || status == 429) {
        LOG_WARN("Network: Server error %d", status);
        return SendResult::FAILED;
    }

    LOG_ERROR("Network: Rejected with %d: %s", status, response.c_str());
    return SendResult::REJECTED;
}