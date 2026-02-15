package org.magics.magicsspring;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GateTestController {
    @GetMapping("/gate/test")
    public String test() { return "OK"; }
}
