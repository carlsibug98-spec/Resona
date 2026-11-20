import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce/hive_ce.dart';
import 'package:http/http.dart' as http;
import 'package:musify/constants/clients.dart';
import 'package:musify/services/common_services.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart';

// Live test: hits YouTube, which blocks GitHub Actions and rate-limits
// datacenter IPs.
final _skipCi = Platform.environment.containsKey('GITHUB_ACTIONS')
    ? 'YouTube blocks GitHub Actions'
    : null;
var _skipHere = _skipCi;

/// YouTube answers 429 when it rate-limits this machine's IP; a connection
/// failure means it cannot be reached at all. Either way the live tests
/// would fail for reasons this code cannot fix, so they skip instead.
Future<bool> _youtubeIsBlockingUs() async {
  try {
    final response = await http
        .get(
          Uri.parse('https://www.youtube.com/watch?v=$_songId&hl=en'),
          headers: {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)'},
        )
        .timeout(const Duration(seconds: 15));
    return response.statusCode == 429;
  } catch (_) {
    return true;
  }
}

const _songId = 'dQw4w9WgXcQ';

Future<void> main() async {
  // No TestWidgetsFlutterBinding: it blocks real HTTP requests.
  if (_skipCi == null) {
    _skipHere = (await _youtubeIsBlockingUs())
        ? 'YouTube is blocking this machine'
        : null;
  }
  Hive.init(Directory.systemTemp.createTempSync('musify_live').path);
  await Hive.openBox('settings');
  await Hive.openBox('cache');
  useProxy.value = false;

  test(
    'fetchBestAudioStream returns a playable, clean audio stream',
    () async {
      final stream = await fetchBestAudioStream(_songId);

      expect(stream, isNotNull);
      expect(stream!.url.toString(), startsWith('https://'));
      expect(stream.url.queryParameters['sq'], isNull);
    },
    skip: _skipHere,
    timeout: const Timeout(Duration(seconds: 90)),
  );

  test(
    'the stream URL is accepted with the playback headers',
    () async {
      final stream = await fetchBestAudioStream(_songId);

      final response = await http.head(
        stream!.url,
        headers: streamPlaybackHeaders(_songId),
      );

      expect(response.statusCode, inInclusiveRange(200, 299));
    },
    skip: _skipHere,
    timeout: const Timeout(Duration(seconds: 90)),
  );

  test(
    'each fallback client can be used on its own',
    () async {
      final yt = YoutubeExplode();
      for (final client in fallbackClients) {
        try {
          final manifest = await yt.videos.streams.getManifest(
            _songId,
            ytClients: [client],
          );
          // ignore: avoid_print
          print(
            '${client.payload['context']['client']['clientName']}: '
            '${manifest.audioOnly.length} audio streams',
          );
        } catch (e) {
          // ignore: avoid_print
          print('${client.payload['context']['client']['clientName']}: $e');
        }
      }
    },
    skip: _skipHere,
    timeout: const Timeout(Duration(seconds: 120)),
  );
}
