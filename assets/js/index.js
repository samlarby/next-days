function handleText() {
      const text = document.getElementById('inputText').value;
      console.log("Text received:", text);
      alert("Text processed: " + text.substring(0, 100)); // show a preview
      // You can add more processing here
    }