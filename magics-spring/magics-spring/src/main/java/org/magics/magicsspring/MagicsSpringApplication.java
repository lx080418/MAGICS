package org.magics.magicsspring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;


@SpringBootApplication
public class MagicsSpringApplication
{
    public static void main(String[] args)
    {
        SpringApplication.run(MagicsSpringApplication.class, args);
        System.out.println("Hello world");
    }

}
