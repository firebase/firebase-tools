package com.example.crashlytics

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.Button
import android.widget.TextView

class MainActivity : AppCompatActivity() {

    private var counter = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val counterText = findViewById<TextView>(R.id.counter_text)
        val incrementButton = findViewById<Button>(R.id.increment_button)

        incrementButton.setOnClickListener {
            counter++
            counterText.text = "Counter: $counter"
            if (counter % 5 == 0) {
                // Intentionally cause a crash to test Crashlytics
                throw RuntimeException("Test Crash")
            }
        }
    }
}
