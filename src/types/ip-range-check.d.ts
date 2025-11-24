declare module 'ip-range-check' {
    function check(ip: string, range: string | string[]): boolean;
    export = check;
}
