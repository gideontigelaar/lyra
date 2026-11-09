#pragma once
#include <Arduino.h>

#ifndef ENABLE_LOGGING
#define ENABLE_LOGGING 1
#endif

#if ENABLE_LOGGING
    #define LOG_INFO(fmt, ...)  Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__)
    #define LOG_WARN(fmt, ...)  Serial.printf("[WARN] " fmt "\n", ##__VA_ARGS__)
    #define LOG_ERROR(fmt, ...) Serial.printf("[ERR ] " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG_INFO(fmt, ...)
    #define LOG_WARN(fmt, ...)
    #define LOG_ERROR(fmt, ...)
#endif