import json
import urllib.request
import urllib.error

# Sample problem text containing a LeetCode-style problem statement
SAMPLE_PROBLEM = """
Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
You may assume that each input would have exactly one solution, and you may not use the same element twice.
You can return the answer in any order.

Constraints:
2 <= nums.length <= 10^5
-10^9 <= nums[i] <= 10^9
-10^9 <= target <= 10^9
Only one valid answer exists.
"""

def test_diagnose():
    url = "http://127.0.0.1:8000/diagnose"
    payload = {"problem_text": SAMPLE_PROBLEM}
    
    headers = {"Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8")
    
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    
    print("Sending diagnosis request to FastAPI server...")
    try:
        with urllib.request.urlopen(req) as response:
            print("\n=== DIAGNOSTIC RESULTS (STREAMED) ===")
            import sys
            while True:
                chunk = response.read(64)
                if not chunk:
                    break
                sys.stdout.write(chunk.decode("utf-8"))
                sys.stdout.flush()
            print("\n==========================\n")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
    except urllib.error.URLError as e:
        print(f"Connection Error: {e.reason}")
        print("Ensure the FastAPI server is running locally on http://127.0.0.1:8000")

if __name__ == "__main__":
    test_diagnose()
