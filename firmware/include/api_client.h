#pragma once

#include "send_result.h"
#include <NetworkClientSecure.h>
#include <WString.h>
#include <cstdint>

class ApiClient {
public:
    void init();
    void poll(uint32_t now_ms);
    bool isConnected() const;
    SendResult get(const char* path, String& response);
    SendResult post(const char* path, const char* json);

private:
    NetworkClientSecure _client;

    bool     _was_connected   = false;
    uint32_t _last_attempt_ms = 0;

    SendResult request(const char* path, const char* json, String& response);
};