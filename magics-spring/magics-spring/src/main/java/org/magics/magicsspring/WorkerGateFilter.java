package org.magics.magicsspring;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
@Component
public class WorkerGateFilter extends OncePerRequestFilter {

    @Value("${security.workerGateKey}")
    private String key;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String p = req.getRequestURI();
        return p.startsWith("/actuator") || p.equals("/mongo/ping");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        String k = req.getHeader("x-worker-key");
        if (k == null || !k.equals(key)) {
            res.sendError(403, "Forbidden");
            return;
        }
        chain.doFilter(req, res);
    }
}

