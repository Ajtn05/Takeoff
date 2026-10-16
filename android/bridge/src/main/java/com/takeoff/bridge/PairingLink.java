package com.takeoff.bridge;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Reads the existing private /controller#session=...&token=... pairing link. */
public final class PairingLink {
    public final String socketUrl, sessionId, token;
    private PairingLink(String socketUrl, String sessionId, String token) {
        this.socketUrl = socketUrl;
        this.sessionId = sessionId;
        this.token = token;
    }

    public static PairingLink parse(String text) {
        try {
            URI uri = new URI(text.trim());
            if ("takeoff".equals(uri.getScheme()) && "pair".equals(uri.getHost())) {
                String link = parameters(uri.getRawQuery()).get("url");
                if (link == null || link.startsWith("takeoff:")) throw new IllegalArgumentException();
                return parse(link);
            }
            if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) ||
                    uri.getHost() == null || uri.getUserInfo() != null ||
                    !"/controller".equals(uri.getPath()) || uri.getRawQuery() != null ||
                    uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            Map<String, String> fields = parameters(uri.getRawFragment());
            String session = fields.get("session"), token = fields.get("token");
            if (session == null || !session.matches("[A-Za-z0-9_-]{1,64}") ||
                    token == null || !token.matches("[A-Za-z0-9_-]{1,128}")) throw new IllegalArgumentException();
            String scheme = "https".equals(uri.getScheme()) ? "wss" : "ws";
            String socket = new URI(scheme, null, uri.getHost(), uri.getPort(), "/ws", null, null).toString();
            return new PairingLink(socket, session, token);
        } catch (Exception error) {
            throw new IllegalArgumentException("Use the complete Pair phone link, including session and token.");
        }
    }

    private static Map<String, String> parameters(String text) throws Exception {
        Map<String, String> result = new HashMap<>();
        if (text == null) return result;
        for (String field : text.split("&")) {
            String[] pair = field.split("=", 2);
            if (pair.length != 2) throw new IllegalArgumentException();
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8.name());
            String value = URLDecoder.decode(pair[1], StandardCharsets.UTF_8.name());
            if (result.put(key, value) != null) throw new IllegalArgumentException();
        }
        return result;
    }
}
