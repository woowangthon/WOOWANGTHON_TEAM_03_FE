export default function PasswordRules({ id }) {
  return (
    <p id={id} className="password-rules">
      비밀번호는 공백·한글 없이 영문·숫자·허용 특수문자만 사용하여 10~30자로
      설정하고, 영문 대문자·소문자·숫자·허용 특수문자를 각각 1개 이상 포함해야
      하며, 흔히 사용되거나 로그인 ID 등 계정 정보와 지나치게 유사한 비밀번호는
      사용할 수 없습니다.
    </p>
  );
}
