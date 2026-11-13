#include "advert_store.h"
#include "config.h"
#include "logger.h"
#include <LittleFS.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>

static const char* const FOLDER = "/queue";

static String pathOf(uint32_t file) {
    char path[24];
    snprintf(path, sizeof(path), "%s/%08lx", FOLDER, static_cast<unsigned long>(file));
    return path;
}

bool AdvertStore::init() {
    if (!LittleFS.begin(true)) {
        LOG_ERROR("Store: Flash unavailable, broadcasts are only kept in memory");
        return false;
    }

    LittleFS.mkdir(FOLDER);
    File folder = LittleFS.open(FOLDER);

    for (File file = folder.openNextFile(); file; file = folder.openNextFile()) {
        _files.push_back(strtoul(file.name(), nullptr, 16));
        _count += file.size() / sizeof(Record);
    }

    std::sort(_files.begin(), _files.end());
    // A quarter of flash stays free, as the file system needs room to work in.
    _capacity = LittleFS.totalBytes() * 3 / 4 / sizeof(Record);
    _ready = true;

    LOG_INFO("Store: %u broadcast(s) waiting, room for %u", (unsigned)_count, (unsigned)_capacity);
    return true;
}

bool AdvertStore::ready() const {
    return _ready;
}

size_t AdvertStore::count() const {
    return _count;
}

size_t AdvertStore::recordsIn(uint32_t file) const {
    File handle = LittleFS.open(pathOf(file), FILE_READ);
    return handle ? handle.size() / sizeof(Record) : 0;
}

// Makes room by dropping the oldest file, and says how many broadcasts went with it.
size_t AdvertStore::dropOldest() {
    if (_files.empty()) {
        return 0;
    }

    size_t records = recordsIn(_files.front());
    size_t dropped = records > _read ? records - _read : 0;
    LittleFS.remove(pathOf(_files.front()));
    _files.pop_front();
    _read = 0;
    _count -= std::min(dropped, _count);
    return dropped;
}

// Adds broadcasts after the ones there are, dropping the oldest when flash is full. Says how many were dropped.
size_t AdvertStore::add(const Record* records, size_t count) {
    size_t dropped = 0;

    if (!_ready) {
        return count;
    }

    while (_count + count > _capacity && !_files.empty()) {
        dropped += dropOldest();
    }

    while (count > 0) {
        size_t used = _files.empty() ? Config::Store::PER_FILE : recordsIn(_files.back());

        if (used >= Config::Store::PER_FILE) {
            _files.push_back(_files.empty() ? 1 : _files.back() + 1);
            used = 0;
        }

        File file = LittleFS.open(pathOf(_files.back()), FILE_APPEND);
        size_t take = std::min(count, Config::Store::PER_FILE - used);
        size_t written = file ? file.write(reinterpret_cast<const uint8_t*>(records), take * sizeof(Record)) / sizeof(Record) : 0;
        file.close();
        _count += written;

        if (written < take) {
            LOG_ERROR("Store: Writing failed, dropping %u broadcast(s)", (unsigned)(count - written));
            return dropped + count - written;
        }

        records += take;
        count -= take;
    }

    return dropped;
}

// The oldest broadcasts, up to max, from one file at a time.
size_t AdvertStore::peek(Record* records, size_t max) {
    if (!_ready || _files.empty()) {
        return 0;
    }

    File file = LittleFS.open(pathOf(_files.front()), FILE_READ);

    if (!file || !file.seek(_read * sizeof(Record))) {
        return 0;
    }

    return file.read(reinterpret_cast<uint8_t*>(records), max * sizeof(Record)) / sizeof(Record);
}

void AdvertStore::pop(size_t count) {
    _read += count;
    _count -= std::min(count, _count);

    if (!_files.empty() && _read >= recordsIn(_files.front())) {
        LittleFS.remove(pathOf(_files.front()));
        _files.pop_front();
        _read = 0;
    }
}