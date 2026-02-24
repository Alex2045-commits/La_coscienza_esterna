<?php
use PHPUnit\Framework\TestCase;
final class TwoFactorTest extends TestCase {

    public function test_admin_requires_2fa(): void {
        $res = $this->postJson('/api/login.php', [
            'identifier'=>'admin',
            'password'=>'password'
        ]);

        $this->assertTrue($res['twofa_required']);
    }

    public function test_invalid_2fa_code(): void {
        $res = $this->postJson('/api/verify_2fa.php', [
            'user_id'=>1,
            'code'=>'000000'
        ]);

        $this->assertEquals('INVALID_2FA', $res['error']);
    }
}
?>