#pragma once

#include <NetworkClientSecure.h>
#include <WString.h>
#include <cstdint>

class ApiClient {
public:
    enum class Result {
        OK,
        REJECTED,
        FAILED
    };

    void init();
    void poll(uint32_t now_ms);
    bool isConnected() const;
    Result get(const char* path, String& response);
    Result post(const char* path, const char* json);

private:
    NetworkClientSecure _client;

    bool     _was_connected   = false;
    uint32_t _last_attempt_ms = 0;

    Result request(const char* path, const char* json, String& response);
};