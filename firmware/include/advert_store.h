#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>

// Broadcasts waiting for the API, kept in flash so they outlast an outage and a restart, oldest first.
// They're written in files of up to 128 and a file goes once it's sent, so flash is only written while the API can't be reached.
class AdvertStore {
public:
    struct Record {
        uint32_t received_at;
        char     address[18];
        uint8_t  data[31];
        uint8_t  length;
        int8_t   rssi;
    } __attribute__((packed));

    bool   init();
    bool   ready() const;
    size_t count() const;
    size_t add(const Record* records, size_t count);
    size_t peek(Record* records, size_t max);
    void   pop(size_t count);
    size_t dropOldest();

private:
    std::deque<uint32_t> _files;
    size_t               _read     = 0;
    size_t               _count    = 0;
    size_t               _capacity = 0;
    bool                 _ready    = false;

    size_t recordsIn(uint32_t file) const;
};