---
header:
   teaser: /assets/images/logo.png

title: "Java 코딩테스트 필수 문법과 자료구조 정리 (1편)"
excerpt: "코딩테스트를 위한 Java 기초부터 자료구조까지 한 번에 정리 (Java 8 기준, Stream/Lambda 미사용)"
categories:
  - Java
tags:
  - 알고리즘
  - 자료구조
  - 코딩테스트
  
toc_label: "Java 코딩테스트 필수 문법과 자료구조 정리"
toc: true
toc_sticky: true

date: 2025-09-17
last_modified_at: 2025-09-17 
---
{% raw %}
# 입력받고 출력하기

## 1. Scanner VS BufferedReader 선택 기준

### Scanner

> 입력이 간단하고 데이터가 적을 때 사용 (10,000개 이하)
>
> - 다양한 자료형을 바로 입력받을 수 있음
> - 속도가 느림

```java
Scanner sc = new Scanner(System.in);

int n = sc.nextInt();
double d = sc.nextrDouble();
String word = sc.next();        // 공백 전까지 문자열
String line = sc.nextLine();    // 한 줄 전체
```

### BufferedReader

> 대량의 데이터(100,000 개 이상) 또는 시간 제한이 엄격한 경우 사용
>
> - 버퍼를 사용하기 때문에 매우 빠른 속도를 보여줌
> - 문자열로만 입력받기 때문에 파싱이 필요

```java
BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
int n = Integer.parseInt(br.readLine());   // 한 줄 읽고 정수 변환

// StringTokenizer와 함께 사용 (split보다 빠름)
StringTokenizer st = new StringTokenizer(br.readLine(), " ");
int a = Integer.parseInt(st.nextToken());
int b = Integer.parseInt(st.nextToken());

// 여러 줄 입력
String[] lines = new String[n];
for(int i = 0; i < n; i++) {
	lines[i] = br.readLine();
}
```

## 2. 2차원 배열 입력 패턴

### 공백으로 구분된 숫자

```java
// 3 4
// 1 2 3 4
// 5 6 7 8
// 9 0 1 2
Scanner sc = new Scanner(System.in);
int n = sc.nextInt();
int m = sc.nextInt();
int[][] arr = new int[n][m];
for(int i = 0; i < n; i++) {
    for(int j = 0; j < m; j++) {
        arr[i][j] = sc.nextInt();
    }
}

// BufferedReader & StringTokenizer 사용
for(int i = 0; i < n; i++) {
    st = new StringTokenizer(br.readLine());
    for(int j = 0; j < m; j++) {
        arr[i][j] = Integer.parseInt(st.nextToken());
    }
}
```

### 붙어있는 숫자

```java
// 3 4
// 1011
// 1001
// 0111
for(int i = 0; i < n; i++) {
    String line = sc.next();
    for(int j = 0; j < m; j++) {
        arr[i][j] = line.charAt(j) - '0';  // 문자를 숫자로 변환
    }
}

// BufferedReader 사용
for(int i = 0; i < n; i++) {
    String line = br.readLine();
    for(int j = 0; j < m; j++) {
        arr[i][j] = line.charAt(j) - '0';
    }
}
```

### 문자 배열

```java
// ###.
// .#.#
// #...
char[][] board = new char[n][m];
for(int i = 0; i < n; i++) {
    board[i] = sc.next().toCharArray();
}

// BufferedReader 사용
char[][] board = new char[n][m];
for(int i = 0; i < n; i++) {
    board[i] = br.readLine().toCharArray();
}
```

## 3. 출력 최적화

### System.out.println

> 출력이 적을 때 사용 (1,000개 이하)
>
> - 매 출력마다 flush 발생으로 느림

### StringBuilder

> 대량 출력시(10,000개 이상) 사용
>
> - System.out.println 보다 약 10배 빠름

```java
StringBuilder sb = new StringBuilder();
for(int i = 0; i < n; i++) {
	sb.append(result[i]).append('\n');
}
System.out.print(sb);
```

### BufferedWriter

> 매우 많은 출력이 필요한 경우 사용
>
> - StringBuilder 보다 약간 더 빠름
> - `flush()` 와 `close()` 필수

```java
BufferedWriter bw = new BufferedWriter(new OutputStreamWriter(System.out));
for(int i = 0; i < n; i++) {
	bw.write(String.valueOf(result[i]));
	bw.newLine();n
}
bw.flush();
bw.close();
```

---

# 자료구조

## 1. 배열과 리스트

### 배열 (Array)

> 크기 고정, 인덱스로 빠른 접근 가능
>
> - 접근 : O(1), 삽입/삭제 : O(n)

```java
// 1차원 배열 선언과 초기화
int[] arr = new int[10];                    // 크기 10, 0으로 초기화
int[] arr2 = {1, 2, 3, 4, 5};               // 직접 초기화
int[] arr3 = new int[]{1, 2, 3, 4, 5};      // new 키워드 사용

// 배열 채우기
Arrays.fill(arr, -1);                       // 모든 원소를 -1로
Arrays.fill(arr, 2, 5, 100);                // 인덱스 2~4를 100으로

// 2차원 배열
int[][] matrix = new int[3][4];             // 3행 4열
int[][] matrix2 = {{1,2,3}, {4,5,6}};       // 직접 초기화

// 2차원 배열 특정 값으로 초기화
for(int[] row : matrix) {
    Arrays.fill(row, -1);
}

// 가변 배열 (각 행의 크기가 다름)
int[][] jagged = new int[3][];
jagged[0] = new int[2];
jagged[1] = new int[3];
jagged[2] = new int[1];
```

### ArrayList

> 동적 크기 조정이 가능하며, 내부적으로는 배열을 사용
>

```java
// 선언과 초기화
List<Integer> list = new ArrayList<>();

// 기본 연산
list.add(10);                     // 끝에 추가 O(1)
list.add(0, 5);                   // 0번 인덱스에 삽입 O(n)
list.set(0, 3);                   // 0번 인덱스 값 변경 O(1)
list.get(0);                      // 0번 인덱스 값 가져오기 O(1)
list.remove(0);                   // 0번 인덱스 제거 O(1)
list.remove(Integer.valueOf(10)); // 값 10 제거
list.clear();                     // 모두 제거

// 상태 확인
list.size();                      // 크기
list.isEmpty();                   // 비어있는지 확인
list.contains(10);                // 포함 여부 확인 O(n)

// 초기값 설정
List<Integer> list2 = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));

// 크기 지정 및 초기화
List<Integer> list3 = new ArrayList<>(Collections.nCopies(10, 0)); // 10개의 0

// 2차원 ArrayList (그래프 인접 리스트에서 자주 사용)
List<List<Integer>> graph = new ArrayList<>();
for(int i = 0; i < n; i++) {
    graph.add(new ArrayList<>());
}

// 값 추가
graph.get(0).add(1);  // 0번 노드에 1번 노드 연결
graph.get(0).add(2);  // 0번 노드에 2번 노드 연결
```

## 2. Stack과 Queue

### Stack (LIFO - 후입선출)

```java
Stack<Integer> stack = new Stack<>();

// 주요 메서드
stack.push(1);                    // 삽입 O(1)
int top = stack.pop();            // 제거하며 반환 O(1)
int peek = stack.peek();          // 제거하지 않고 반환 O(1)
boolean empty = stack.isEmpty();
int size = stack.size();
int pos = stack.search(1);        // 1의 위치

// Deque를 Stack으로 사용 (Stack보다 더 빨라서 권장)
Deque<Integer> stack2 = new ArrayDeque<>();
stack2.push(1);           // addFirst()와 동일
int top2 = stack2.pop();  // removeFirst()와 동일
```

### Queue (FIFO - 선입선출)

```java
Queue<Integer> queue = new LinkedList<>();

// 주요 메서드
queue.offer(1);              // 삽입 (add보다 안전) O(1)
int front = queue.poll();    // 제거하며 반환 O(1)
int peek = queue.peek();     // 제거하지 않고 반환 O(1)
int size = queue.size();
boolean empty = queue.isEmpty();
```

### Deque (Double-ended Queue)

> 양쪽 끝에서 삽입/삭제가 가능하며, `ArrayDeque` 구현체를 권장한다. (`LinkedList` 보다 빠름)
>

```java
Deque<Integer> deque = new ArrayDeque<>();

// 앞쪽 조작
deque.addFirst(1);               // 맨 앞에 추가
deque.removeFirst();             // 맨 앞 제거
deque.peekFirst();               // 맨 앞 확인

// 뒤쪽 조작
deque.addLast(2);                // 맨 뒤에 추가
deque.removeLast();              // 맨 뒤 제거
deque.peekLast();                // 맨 뒤 확인

// poll은 null 반환, remove는 예외 발생
int first = deque.pollFirst();   // 앞에서 제거, 없으면 null
int last = deque.pollLast();     // 뒤에서 제거, 없으면 null
```

## 3. 우선순위 큐 (Priority Queue / Heap)

> 우선순위가 높은 원소부터 제거
>
> - 내부 구현 : 이진 힙 (완전 이진 트리)
> - 삽입 /삭제 : O(log n), 최솟값 확인 : O(1)

```java
// 최소힙 (기본)
PriorityQueue<Integer> minHeap = new PriorityQueue<>();
minHeap.offer(3);
minHeap.offer(1);
minHeap.offer(2);
System.out.println(minHeap.poll());   // 1 출력

// 최대힙
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());

// 커스텀 정렬 - Comparable 인터페이스 구현
class Node implements Comparable<Node> {
	int x, y, cost;
		
	Node(int x, int y, int cost) {
        this.x = x;
        this.y = y;
        this.cost = cost;
    }
		
    @Override
    public int compareTo(Node o) {
        /*
        *  음수 : this가 우선순위 높음
        *  양수 : o 가 우선순위 높음
        *  0 : 같음
        */
        if(this.cost == o.cost) {
                return this.x - o.x;   // cost가 같다면 x를 기준으로 오름차순
        }
        return this.cost - o.cost; // cost 기준으로 오름차순
    }
}

PriorityQueue<Node> pq = new PriorityQueue<>();

// 커스텀 정렬 - Comparator 사용
PriorityQueue<int[]> pq2 = new PriorityQueue<>(new Comparator<int[]>() {
    @Override
    public int compare(int[] a, int[] b) {
            return a[0] - b[0];
    }
});

// 주요 메서드
pq.offer(1);             // 추가 O(log n)
pq.poll();               // 최솟값 제거 및 반환 O(log n)
pq.peek();               // 최솟값 확인 O(1)
pq.size();              
pq.isEmpty();
pq.clear();              // 모두 제거 O(n)
pq.contains(2);          // 포함 여부 확인 O(n)
```

## 4. Map과 Set

### HashMap

> Key-Value 쌍, 순서를 보장하지 않으며 `null` 허용
>

```java
Map<String, Integer> map = new HashMap<>();

// 기본 연산
map.put("apple", 1);                       // 추가/수정 O(1)
map.get("apple");                          // 값 가져오기, 없으면 null O(1)
map.getOrDefault("orange", 0);             // 값 가져오기, 없으면 기본값 O(1)
map.remove("apple");                       // 제거 O(1)
map.size();
map.clear();
map.isEmpty();

// 유용한 메서드
map.putIfAbsent("orange", 2);              // 키가 없을 때만 추가
map.compute("apple", (k, v) -> v + 1);     // 값 계산

// 확인
map.containsKey("apple");                  // 키 존재 확인 O(1)
map.containsValue(1);                      // 값 존재 확인 O(n)

// 순회
for(Map.Entity<String, Integer> entry : map.entrySet()) {
    String key = entry.getKey();
    int value = entry.getValue();
}

// Key만 순회
for(String key : map.keySet()) { ... }

// Value만 순회
for(int value : map.values()) { ... }
```

### TreeMap

> Red-Black Tree, Key 기준으로 정렬하며, `null` 키는 불가능하다.
>
>
> 모든 연산 O(log n)
>

```java
Map<String, Integer> treeMap = new TreeMap<>();

// Key를 기준으로 자동 정렬
treeMap.put("banana", 2);
treeMap.put("apple", 1);
treeMap.put("cherry", 3);

// 순회시 : apple, banana, cherry 순서

Map<Integer. String> treeMap = new TreeMap<>();
treeMap.firstKey();      // 가장 작은 키
treeMap.lastKey();       // 가장 큰 키
treeMap.higherKey(3);    // 3보다 큰 첫 키
treeMap.lowerKey(3)      // 3보다 작은 마지막 키
```

### HashSet

> 중복을 허용하지 않으며, 순서도 보장하지 않는다.
>
> - 평균 O(1), 최악의 경우 O(n)

```java
Set<Integer> set = new HashSet<>();

// 기본 연산
set.add(1);                 // 추가 O(1)
set.add(1);                 // 무시됨
set.contains(1);            // 포함 여부 확인 O(1)        
set.remove(1);              // 제거 O(1)
set.size();
set.clear();
set.isEmpty();

// Set 연산
Set<Integer> set1 = new HashSet<>(Arrays.asList(1, 2, 3));
Set<Integer> set2 = new HashSet<>(Arrays.asList(2, 3, 4));

// 합집합
set1.addAll(set2);           // {1, 2, 3, 4}

// 교집합
set1.retainAll(set2);        // {2, 3}

// 차집합
set1.removeAll(set2);        // {1}
```

### TreeSet

> Red-Black Tree, 정렬된 Set
>
> - 모든 연산 O(log n)

```java
Set<Integer> treeSet = new TreeSet<>();

treeSet.add(3);
treeSet.add(1);
treeSet.add(2);

treeSet.first();    // 가장 작은 원소, 1
treeSet.last();     // 가장 큰 원소, 3
treeSet.higher(2);  // 2보다 큰 첫 원소, 3
treeSet.lower(2);   // 2보다 작은 마지막 원소, 1
treeSet.ceiling(2); // 2 이상인 첫 원소, 2
treeSet.floor(2);   // 2 이하인 마지막 원소, 2
```

---

# 문자열 처리

## 1. 문자열 기본 조작

> `String` 은 불변(immutable) 객체이므로 문자열 열결 시 새로운 객체를 생성한다.
>
>
> *StringBuilder 사용 권장*
>

```java
String str = "Hello World";

// 길이와 접근
int len = str.length();
char ch = str.charAt(0);  // 'H'

// 부분 문자열
String sub1 = str.subString(6);        // "World" (6번부터 끝까지)
String sub2 = str.subString(0, 5);     // "Hello" (0번부터 4번까지)

// 검색
int idx = str.indexOf("World");             // 6 (첫 위치)
int notFound = str.indexOf("xyz");          // -1 (없으면 -1)
int lastIdx = str.lastIndexOf('l');         // 9 (첫 'l' 위치)

// 확인
boolean contains = str.contains("Hello");
boolean starts = str.startsWith("Hello");
boolean ends = str.endsWith("World");
boolean empty = str.isEmpty();

// 변환
String upper = str.toUpperCase();        // "HELLO WORLD"
String lower = str.toLowerCase();        // "hello world"
String trimmed = "    hello    ".trim(); // "hello" (앞뒤 공백 제거)

// 치환
String replaced = str.replace("World", "Java");    // "Hello Java"
String replacedAll = str.replaceAll("[0-9]", "");  // 정규 표현식 활용
```

## 2. 문자열 분리와 결합

```java
// split
String data = "apple,banana,orange";
String[] fruits = data.split(",");           // 콤마로 분리
String[] words = "hello world".split(" ");   // 공백으로 분리
String[] chars = "abc".split("");            // 각 문자로 분리 ["a", "b", "c"]

// 정규식 split
String[] numbers = "1-2-3--4".split("-+");   // 연속된 - 처리 (정규표현식) ["1", "2", "3", "4"]
String[] onlyChar = "a1b2c3".split("\\d");   // ["a", "b", "c"]

// join - 문자열 결합 (Java 8+)
String joined = String.join("-", "a", "b", "c");            // "a-b-c"
String joined2 = String.join("", Arrays.asList("a", "b"));  // "ab"
String joined3 = String.join(", ", fruits);                 // "apple, banana, orange"

// StringBuilder (문자열 연결 최적화)
StringBuilder sb = new StringBuilder();
sb.append("Hello");
sb.append(" ");
sb.append("World");

sb.insert(0, "Say ");     // 맨 앞에 삽입 "Say Hello World"
sb.delete(0, 4);          // 0~3 인덱스 삭제 "Hello World"
sb.reverse();             // 뒤집기
String result = sb.toString();

// StringBuilder 체이닝
String result2 = new StringBuilder()
    .append("Hello")
    .append(" ")
    .reverse()
    .toString();
```

## 3. 문자와 숫자 변환

```java
// 문자 <-> 숫자
char c = '5';
int num = c - '0';             // 5 (문자를 숫자로)
char c2 = (char)(num + '0');   // '5' (숫자를 문자로)

// 문자 <-> 아스키코드
char ch = 'A';
int ascii = (int)ch;         // 65
char fromAscii = (char)65;   // 'A'

// 문자열 -> 숫자
String str = "123";
int intVal = Integer.parseInt(str);              // 123
long longVal = Long.parseLong(str);              // 123L
double doubleVal = Double.parseDouble("3.14");

// 숫자 -> 문자열
int num = 123;
String str = String.valueOf(num);             // "123" (권장)
String str2 = Integer.toString(num);
String str3 = "" + num;

// 진법 변환
String binary = Integer.toBinaryString(10);    // "1010"
String octal = Integer.toOctalString(10);      // "12"
String hex = Integer.toHexString(10);          // "a"

int fromBinary = Integer.parseInt("1010", 2);  // 10
int fromHex = Integer.parseInt("FF", 16);      // 255
```

## 4. 문자 판별과 처리

```java
char ch = 'A';

// 판별
boolean isLetter = Character.isLetter(ch);          // true (알파벳 여부 확인)
boolean isDigit = Character.isDigit('5');           // true (숫자 여부 확인)
boolean isUpperCase = Character.isUpperCase(ch);    // true (대문자 여부 확인)
boolean isWhitespace = Character.isWhitespace(' '); // true

// 대소문자 변환
char lower = Character.toLowerCase(ch);   // 'a'
char upper = Character.toUpperCase('a');  // 'A'

// char[] <-> String
String str = "hello";
char[] chars = str.toCharArray();             // ['h', 'e', 'l', 'l', 'o']
String fromChars = new String(chars);         // "hello"
String fromChars2 = String.valueOf(chars);    // "hello"
```

## 5. 정규표현식

```java
String text = "abc123DEF456";

// 치환
text.replaceAll("[0-9]", "");         // "abcDEF" (숫자 제거)
text.replaceAll("[^0-9]", "");        // "123456" (숫자만 남김)
text.replaceAll("[a-z]", "");         // "123DEF456" (소문자 제거)
text.replaceAll("[^a-zA-Z]", "");     // "abcDEF" (알파벳만 남김)
text.replaceAll("\\s", "");           // 공백 제거
text.replaceAll("[^a-z0-9-_.]", "");  // 특수문자 제거

// 연속된 문자 처리
"aabbcc".replaceAll("(.)\\1+", "$1");  // "abc" (연속 문자 제거)
"a...b..c.".replaceAll("\\.+", ".");   // "a.b.c." (연속 마침표 제거)

// 앞뒤 특정 문자 제거
"..hello..".replaceAll("^\\.|\\.$", "");   // ".hello." (앞뒤 마침표 하나씩)
"..hello..".replaceAll("^\\.+|\\.+$", ""); // "hello" (앞뒤 모든 마침표)

// 패턴 확인
boolean isNumber = "123".matches("\\d+");                // true
boolean isAlpha = "abc".matches("[a-zA-Z]+");            // true
boolean isEmail = "test@test.com".matches(".*@.*\\..*"); // true
```

---

# 배열 다루기

## 1. 배열 복사

### 1차원 배열 깊은 복사

```java
int[] original = {1, 2, 3, 4, 5};

// clone()
int[] copy1 = original.clone();

// Arrays.copyOf() - 크기 조정 가능
int[] copy2 = Arrays.copyOf(original, original.length);    // 같은 크기
int[] copy3 = Arrays.copyOf(original, 10);                 // 크기 늘리기, 남은 공간은 0으로 채움
int[] copy4 = Arrays.copyOf(original, 3);                  // 크기 줄이기, [1, 2, 3]

// Arrays.copyOfRange() - 범위 지정
int[] copy4 = Arrays.copyOfRange(original, 1, 4);          // [2, 3, 4]

// System.arraycopy(원본, 원본시작, 대상, 대상시작, 개수) - 가장 빠름
int[] copy5 = new int[original.length];
System.arraycopy(original, 0, copy5, 0, original.length);
```

### 2차원 배열 깊은 복사

```java
int[][] matrix = {{1, 2}, {3, 4}, {5, 6}};

// 각 행을 clone 하는 방법
int[][] deepCopy = new int[matrix.length][];
for(int i = 0; i < matrix.length; i++) {
		deepCopy[i] = matrix[i].clone();
}

// 2중 for문 사용
int[][] deepCopy2 = new int[matrix.legnth][matrix[0].length];
for(int i = 0; i < matrix.legnth; i++) {
    for(int j = 0; j < matrix[0].length; j++){
        deepCopy2[i][j] = matrix[i][j];
    }
}
```

## 2. 컬렉션 변환

### List ↔ Array

```java
// List -> Array
List<Integer> list = Arrays.asList(1, 2, 3);

Integer[] arr = list.toArray(new Integer[0]);

// Array -> List
Integer[] array = {1, 2, 3, 4, 5};

List<Integer> list2 = Arrays.asList(array);                  // 고정 크기 (수정 불가)
List<Integer> list3 = new ArrayList<>(Arrays.asList(array)); // 수정 가능
```

### int[] ↔ List<Integer>

```java
Integer[] intArr = {1, 2, 3};
List<Integer> intList = new ArrayList<>();
for(int num : intArr) {
    intList.add(num);
}

// List<Integer> -> int[]
List<Integer> intList2 = Arrays.asList(1, 2, 3);
int[] intArr2 = new int[intList2.size()];
for(int i = 0; i < intList2.size(); i++) {
    intArr2[i] = intList2.get(i);
}
```

### Set ↔ List

```java
// List -> Set (중복 제거)
List<Integer> listWithDup = Arrays.asList(1,2,2,3,3,3);
Set<Integer> set = new HashSet<>(listWithDup);          // {1, 2, 3}

// Set -> List
Set<Integer> set2 = new HashSet<>(Arrays.asList(1,2,3));
List<Integer> listFromSet = new ArrayList<>(set2);
```

---

# 정렬과 탐색

## 1. 정렬

### 1차원 배열 정렬

```java
int[] arr = {3, 1, 4, 1, 5};

// 기본 정렬
Arrays.sort(arr);           // 전체 오름차순
Arrays.sort(arr, 1, 4);     // 부분 정렬 (1~3 인덱스)

// 내림차순 (Integer 배열만 가능)
Integer[] arrInteger = {3, 1, 4, 1, 5};
Arrays.sort(arrInteger, Collections.reverseOrder());
```

### 2차원 배열 정렬

```java
int[][] points = {{3,5}, {1,2}, {4,1}, {1,3}};

// 첫 번째 원소 기준 오름차순, 같은 경우 두 번째 원소 기준
Arrays.sort(points, new Comparator<int[]>() {
    @Override
    public int compare(int[] a, int[] b) {
        if(a[0] == b[0]) return a[1] - b[1];    // 첫 번째 원소가 같은 경우 두 번째 기준 오름차순
        return a[0] - b[0];				
    }
});

// 결과 : [[1,2], [1,3], [3,5], [4,1]]
```

### 리스트 정렬

```java
List<Integer> list = new ArrayList<>(Arrays.asList(3,1,4,1,5));

Collections.sort(list);                                // 오름차순
Collections.sort(list, Collections.reverseOrder());    // 내림차순

// 객체 리스트 정렬
class Person {
    String name;
    int age;
		
    Person(String name, int age) {
        this.name = name;
        this.age = age;
    }
}

List<Person> people = new ArrayList<>();

// 나이순, 같은 경우 이름순 정렬
Collections.sort(people, new Comparator<Person>() {
    @Override
    public int compare(Person a, Person b) {
        if(a.age == b.age) {
            return a.name.compareTo(b.name);  // 문자열 비교
        }
        return a.age - b.age;                 // 나이 기준 오름차순
        // return b.age - a.age;              // 내림차순
    }
});
```

### 문자열 정렬

```java
String[] words = {"banana", "apple", "cherry"};
Arrays.sort(words);                              // 사전순 정렬

// 길이순 정렬
Arrays.sort(words, new Comparator<String>() {
    @Override
    public int compare(String a, String b) {
        if(a.length() == b.length()) {
            return a.compareTo(b);              // 길이가 같은 경우 사전순 정렬
        }
        return a.length() - b.length();         // 길이순 정렬
    }
});
```

## 2. 이진 탐색 (Binary Search)

> 정렬된 배열/리스트에서 사용가능하며, O(log n)의 시간복잡도를 가짐
>

### 배열과 리스트에서 이진 탐색

```java
// 배열에서 이진 탐색
int[] sorted = {1, 3, 5, 7, 9, 11};

int index = Arrays.binarySearch(sorted, 7);       // 3 반환
int notFound = Arrays.binarySearch(sorted, 6);    // -4 (음수 = 해당 값이 없다는 것을 의미)
// 음수 반환값 : -(삽입 위치 + 1), -4 -> 해당 값은 없지만 3번 인덱스에 삽입하면 됨.

// 리스트에서 이진 탐색
List<Integer> list = Arrays.asList(1, 3, 5, 7, 9);
int idx = Collections.binarySearch(list, 5);         // 2 반환
```

### 기본 이진 탐색

```java
public int binarySearch(int[] arr, int target, int left, int right) {
    while(left <= right) {
        int mid = left + (right - left) / 2;  // 오버플로우 방지
            
        if(arr[mid] == target) {
            return mid;
        } else if(arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1;  // 찾지 못한 경우
}
```

### Lower Bound & Upper Bound

```java
// Lower Bound (target 이상인 첫 위치)
public int lowerBound(int[] arr, int target) {
    int left = 0, right = arr.length;
		
    while(left < right) {
        int mid = left + (right - left) / 2;
        if(arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }
    return left;
}
// [1, 2, 2, 2, 3, 4] 에서 2의 lowerBound = 1

// Upper Bound (target 초과인 첫 위치)
public int upperBound(int[] arr, int target) {
    int left = 0, right = arr.length;
		
    while(left < right) {
        int mid = left + (right - left) / 2;
        if(arr[mid] <= target) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }
    return left;
}
// [1, 2, 2, 2, 3, 4] 에서 2의 upperBound = 4

// target의 개수 구하기
int count = upperBound(arr, target) - lowerBound(arr, target);
```

---

# 수학과 비트 연산

## 1. 기본 수학 연산

```java
// 절댓값, 최대/최소
int abs = Math.abs(-5);           // 5
int max = Math.max(10, 20);       // 20
int min = Math.min(10, 20);       // 10

// 거듭제곱, 제곱근
double pow = Math.pow(2, 10);     // 1024.0 (2^10)
double sqrt = Math.sqrt(16);      // 4.0

// 올림, 내림, 반올림
double ceil = Math.ceil(4.2);     // 5.0
double floor = Math.floor(4.8);   // 4.0
long round = Math.round(4.6);     // 5

// 로그
double log = Math.log(Math.E);    // 1.0 (자연로그)
double log10 = Math.log10(100);   // 2.0 (상용로그)
```

## 2. 최대공약수와 최소공배수

### 최대공약수 (Greatest Common Divisor)

```java
// 유클리드 호제법
public int gcd(int a, int b) {
    return b == 0 ? a : gcd(b, a % b);
}

// 반복문 버전
public int gcdIterative(int a, int b) {
    while (b != 0) {
        int temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// 여러 수의 GCD
public int gcdMultiple(int[] arr) {
    int result = arr[0];
    for(int i = 1; i < arr.length; i++) {
        result = gcd(result, arr[i]);
    }
    return result;
}
```

### 최소공배수 (Least Common Multiple)

```java
public int lcm(int a, int b) {
    return a / gcd(a, b) * b; // 오버플로우 방지 (a * b 대신)
}

// 여러 수의 LCM
public int lcmMultiple(int[] arr) {
    int result = arr[0];
    for(int i = 1; i < arr.length; i++) {
        result = lcm(result, arr[i]);
    }
    return result;
}
```

## 3. 소수 판별과 에라토스테네스의 체

### 단일 소수 판별 O(√n)

```java
public boolean isPrime(int n) {
    if(n < 2) return false;
		
    for(int i = 2; i * i <= n; i++) {
        if(n % i == 0) return false;
    }
    return true;
}
```

### 에라토스테네스의 체

> 범위 내 모든 소수 구하기
>
> - 시간 복잡도 : O(n log log n)
> - 공간 복잡도 : O(n)

```java
public boolean[] sieveOfEratosthenes(int n) {
    boolean[] isPrime = new boolean[n + 1];
    Arrays.fill(isPrime, true);
    isPrime[0] = isPrime[1] = false;
		
    for(int i = 2; i * i <= n; i++) {
        if(isPrime[i]) {
            // i의 배수 지우기 (i*i부터 시작)
            for(int j = i * i; j <= n; j += i) {
                isPrime[j] = false;
            }
        }
    }
    return isPrime;
}
```

### 소인수분해

```java
public List<Integer> primeFactorization(int n) {
    List<Integer> factors = new ArrayList<>();
		
    for(int i = 2; i * i <= n; i++) {
        while(n % i == 0) {
            factors.add(i);
            n /= i;
        }
    }
    if(n > 1) factors.add(n);
		
    return factors;
}
```

## 4. 비트 연산

### 기본 비트 연산

```java
int a = 5;         // 0101
int b = 3;         // 0011

int and = a & b;   // 0001 = 1 (AND)
int or = a | b;    // 0111 = 7 (OR)
int xor = a ^ b;   // 0110 = 6 (XOR)
int not = ~a;      // 1111 .... 1010 = -6 (NOT)
```

### 시프트 연산

```java
int left = a << 1;            // 1010 = 10 (왼쪽 시프트, *2)
int right = a >> 1;           // 0010 = 2 (오른쪽 시프트, /2)
int unsignedRight = a >>> 1;  // 부호 없는 오른쪽 시프트
```

### 비트 마스킹

```java
int num = 0b1010;                // 10

// n번째 비트 켜기 (0부터 시작)
int setBit = num | (1 << n);            // n=2인 경우 1110

// n번째 비트 끄기
int clearBit = num & ~(1 << n);         // n=3인 경우 0110

// n번째 비트 토글
int toggleBit = num ^ (1 << n);         // n=1인 경우 0100

// n번째 비트 확인
boolean isSet = (num & (1 << n)) != 0;

boolean isPowerOfTwo = n > 0 && (n & (n - 1)) == 0;  // 2의 거듭제곱
int clearRightmost = n & (n - 1);                    // 가장 오른쪽 1을 0으로
int isolateRightmost = n & -n;                       // 가장 오른쪽 1만 남기기
```

### 부분집합 생성

```java
int[] elements = {1, 2, 3};
int n = elements.length;

for(int mask = 0; mask < (1 << n); mask++) {
    System.out.print("{ ");
    for(int i = 0; i < n; i++) {
        if((mask & (1 << i)) != 0) {
            System.out.print(elements[i] + " ");
        }
    }
    System.out.println("}");
}

// 출력 : { }, { 1 }, { 2 }, { 1 2 }, { 3 }, { 1 3 }, { 2 3 }, { 1 2 3 }
```

---

# 순열과 조합

## 1. 순열 (Permutation)

> 순서가 있는 선택, nPr = n! / (n-r)!
>

### 순열

```java
public void permutation(int[] arr, boolean[] visited, int[] output, int depth, int n, int r) {
    if(depth == r) {
        // output 배열에 순열 하나가 완성
        for(int i = 0; i < r; i++) {
            System.out.println(output[i] + " ");
        }
        System.out.println();
        return;
    }
		
    for(int i = 0; i < n; i++) {
        if(!visited[i]) [
            visited[i] = true;
            output[depth] = arr[i];
            permutation(arr, visited, output, depth + 1, n, r);
            visited[i] = false;
        }
    }
}

// 사용
int[] arr = {1, 2, 3};
boolean[] visited = new boolean[3];
int[] output = new int[2];
permutation(arr, visited, output, 0, 3, 2);
```

### 중복 순열

```java
public void permutationWithRep(int[] arr, int[] output, int depth, int n, int r) {
    if(depth == r) {
        for(int i = 0; i < r; i++) {
            System.out.println(output[i] + " ");
        }
        System.out.println();
        return;
    }
		
    for(int i = 0; i < n; i++) {
        output[depth] = arr[i];
        permutationWithRep(arr, output, depth + 1, n, r);
    }
}
```

## 2. 조합 (Combination)

> 순서가 없는 선택, nCr = n! / (r! * (n-r)!)
>

### 조합

```java
public void combination(int[] arr, int[] output, int start, int depth, int n, int r) {
    if(depth == r) {
        for(int i = 0; i < r; i++) {
            System.out.println(output[i] + " ");
        }
        System.out.println();
        return;
    }
		
    for(int i = start; i < n; i++) {
        output[depth] = arr[i];
        combination(arr, output, i + 1, depth + 1, n, r);
    }
}
```

### 중복 조합

```java
public void combinationWithRep(int[] arr, int[] output, int start, int depth, int n, int r) {
    if(depth == r) {
        for(int i = 0; i < r; i++) {
            System.out.println(output[i] + " ");
        }
        System.out.println();
        return;
    }
		
    for(int i = start; i < n; i++) {
        output[depth] = arr[i];
        combinationWithRep(arr, output, i, depth + 1, n, r); // i+1이 아닌 i
    }
}
```

### 조합 수 계산

```java
public long combination(int n, int r) {
    if(r > n - r) r = n - r;   // nCr = nC(n-r) 최적화
		
    long result = 1;
    for(int i = 0; i < r; i++) {
        result *= (n - i);
        result /= (i + 1);
    }
    return result;
}
```
{% endraw %}